import express from "express";
import bodyParser from "body-parser";
import rateLimit from "express-rate-limit";
import fs from "fs";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import pLimit from "p-limit";
import { YouTubeExtractor } from "./extractor";
import { uploadFile } from "./supabase";
import logger from "./utils/logger";
import { PORT, TEMP_DIR, REQUEST_TIMEOUT_MS, CONCURRENCY, STORAGE_BUCKET } from "./config";
import { requireApiKey } from "./middleware/auth";

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "1mb" }));

app.use(rateLimit({ windowMs: 60 * 1000, max: 30 }));

const limiter = pLimit(CONCURRENCY || 2);
const extractor = new YouTubeExtractor(TEMP_DIR);

app.get("/health", async (req, res) => {
  try {
    // quick fs check
    const ok = fs.existsSync(TEMP_DIR);
    res.json({ ok: true, tempDirExists: ok });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post("/extract", requireApiKey, async (req, res) => {
  const timer = setTimeout(() => {
    logger.warn("request timeout");
    // Note: express will continue processing but we'll send timeout
  }, REQUEST_TIMEOUT_MS);

  try {
    const { youtubeUrl, start, end } = req.body as { youtubeUrl: string; start: string; end: string };
    if (!youtubeUrl || !start || !end) return res.status(400).json({ success: false, error: "missing fields" });
    if (!extractor.isValidYouTubeUrl(youtubeUrl)) return res.status(400).json({ success: false, error: "invalid youtube url" });

    const startSec = extractor.parseTimestamp(start);
    const endSec = extractor.parseTimestamp(end);
    const vErr = extractor.validateTimestamps(startSec!, endSec!);
    if (vErr) return res.status(400).json({ success: false, error: vErr });

    const duration = endSec! - startSec!;

    // enqueue work with concurrency limit
    const result = await limiter(async () => {
      // download
      const downloaded = await extractor.downloadAudio(youtubeUrl);
      // trim
      const trimmed = await extractor.trimToMp3(downloaded, startSec!, duration);
      // upload
      const destPath = `performances/${uuidv4()}/${path.basename(trimmed)}`;
      const { publicUrl, storagePath } = await uploadFile(STORAGE_BUCKET, destPath, trimmed);
      // cleanup
      await extractor.cleanup(downloaded, trimmed);
      return { publicUrl, storagePath };
    });

    clearTimeout(timer);
    return res.json({ success: true, audioUrl: result.publicUrl, storagePath: result.storagePath, durationSeconds: duration });
  } catch (err: any) {
    // Log full stack when available
    if (err instanceof Error) {
      logger.error(err.stack || err.message);
      console.error(err);
    } else {
      try {
        logger.error(JSON.stringify(err));
      } catch (e) {
        logger.error(String(err));
      }
    }
    clearTimeout(timer);
    const debug = process.env.LOG_LEVEL === "debug";
    return res.status(500).json({ success: false, error: debug ? (err?.message || String(err)) : "processing failed" });
  }
});

app.listen(PORT, () => {
  logger.info({ msg: "yt-extractor-service listening", port: PORT });
});
