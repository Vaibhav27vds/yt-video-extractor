import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import youtubedl from "yt-dlp-exec";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import ytdl from "ytdl-core";
import logger from "./utils/logger";
import { TEMP_DIR, MAX_SEGMENT_SECONDS } from "./config";

ffmpeg.setFfmpegPath(ffmpegPath as string);

export class YouTubeExtractor {
  tempDir: string;
  constructor(tempDir = TEMP_DIR) {
    this.tempDir = tempDir;
    this.ensureTempDir();
  }

  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
  }

  isValidYouTubeUrl(url: string) {
    return /^(https?:\/\/(www\.)?)?(youtube\.com|youtu\.be)\/.+/i.test(url);
  }

  normalizeYouTubeUrl(url: string) {
    try {
      const u = new URL(url);
      let videoId = "";
      if (u.hostname.includes("youtu.be")) {
        videoId = u.pathname.slice(1);
      } else {
        videoId = u.searchParams.get("v") || "";
      }
      if (!videoId) return url;
      return `https://www.youtube.com/watch?v=${videoId}`;
    } catch (e) {
      return url;
    }
  }

  parseTimestamp(ts: string) {
    // Accept MM:SS or HH:MM:SS
    if (!ts || typeof ts !== "string") return null;
    // allow dot or colon separators (0.30 or 0:30)
    const cleaned = ts.replace(/\./g, ":");
    const parts = cleaned.split(":").map(Number).reverse();
    if (parts.some((n) => Number.isNaN(n))) return null;
    let seconds = 0;
    for (let i = 0; i < parts.length; i++) seconds += parts[i] * Math.pow(60, i);
    return seconds;
  }

  validateTimestamps(startSec: number, endSec: number) {
    if (startSec == null || endSec == null) return "invalid timestamps";
    if (endSec <= startSec) return "end must be after start";
    if (endSec - startSec > MAX_SEGMENT_SECONDS) return `segment too long (max ${MAX_SEGMENT_SECONDS}s)`;
    return null;
  }

  async downloadAudio(youtubeUrl: string, outBaseName?: string, timeoutMs = 120000) {
    this.ensureTempDir();
    const id = outBaseName || uuidv4();
    const outPath = path.resolve(this.tempDir, `${id}.%(ext)s`).replace(/\\/g, "/");
    logger.info({ msg: "starting download", youtubeUrl, outPath });
    // Use yt-dlp to get best audio and write to temp
    // Use youtube-dl-exec which returns a promise
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("download timeout"));
      }, timeoutMs);

      // Try download with cwd set to tempDir and simple filename template
      // try with a small retry/backoff loop
      const maxAttempts = 3;
      let attempt = 0;
      const tryDownload = async (): Promise<void> => {
        attempt++;
        try {
          const normalizedUrl = this.normalizeYouTubeUrl(youtubeUrl);
          logger.info({ msg: 'normalized url', normalizedUrl });
          const res: any = await youtubedl(normalizedUrl, {
            output: `${path.join(this.tempDir, id)}.%(ext)s`,
            extractAudio: true,
            audioFormat: 'mp3',
            format: "bestaudio/best",
            noPlaylist: true,
            geoBypass: true,
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
            preferFreeFormats: true,
            ffmpegLocation: path.dirname(ffmpegPath as string)
          } as any);
          clearTimeout(timer);
          logger.info({ msg: "youtube-dl stdout (primary)", stdout: res, attempt });
          // scan temp dir for matching files
          const all = fs.readdirSync(this.tempDir);
          logger.info({ msg: "temp files after download", files: all });
          let match = all.find((f) => f.includes(id));
          if (!match) {
          // Fallback: try to retrieve direct audio URL via youtube-dl JSON and stream-download it
            // attempt fallback JSON download
            try {
              logger.info({ msg: "attempting fallback: fetch video info" });
              const info: any = await youtubedl(normalizedUrl, { dumpSingleJson: true, noPlaylist: true } as any);
              logger.info({ msg: "video info retrieved", title: info?.title });
              const formats = info?.formats || [];
              logger.info({ msg: 'formats count', count: formats.length });
              const audioFormats = formats.filter((f: any) => f.acodec && f.acodec !== "none");
              audioFormats.sort((a: any, b: any) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0));
              const chosen = audioFormats[0] || formats[0];
              logger.info({ msg: 'chosen format', chosen: !!chosen });
                if (!chosen || !chosen.url) {
                logger.warn({ msg: 'no chosen format from youtube-dl; attempting ytdl-core fallback' });
                try {
                  const info2 = await ytdl.getInfo(normalizedUrl);
                  logger.info({ msg: 'ytdl-core info retrieved' });
                  const stream = ytdl.downloadFromInfo(info2, { quality: 'highestaudio', filter: 'audioonly' });
                  const dest = path.join(this.tempDir, `${id}.mp3`);
                  const writer = fs.createWriteStream(dest);
                  await new Promise((resW, rejW) => {
                    stream.pipe(writer);
                    stream.on('end', resW);
                    stream.on('error', rejW);
                  });
                  clearTimeout(timer);
                  return resolve(dest);
                } catch (ytdlErr: any) {
                  logger.error({ msg: 'ytdl-core fallback failed', err: (ytdlErr && (ytdlErr.stack || ytdlErr.message)) || String(ytdlErr) });
                  throw new Error("no downloadable format found (private/age-restricted/geo-blocked)");
                }
              }
              const ext = chosen.ext || 'm4a';
              const dest = path.join(this.tempDir, `${id}.${ext}`);
              logger.info({ msg: "downloading fallback url", url: chosen.url, dest });
              const resp = await axios.get(chosen.url, { responseType: 'stream', maxRedirects: 5 });
              logger.info({ msg: 'axios response status', status: resp.status });
              const writer = fs.createWriteStream(dest);
              await new Promise((resW, rejW) => {
                resp.data.pipe(writer);
                resp.data.on('end', resW);
                resp.data.on('error', rejW);
              });
              clearTimeout(timer);
              return resolve(dest);
            } catch (fallbackErr: any) {
              logger.error({ msg: 'fallback download failed', err: (fallbackErr && (fallbackErr.stack || fallbackErr.message)) || String(fallbackErr) });
              // as last resort check cwd
              const cwdFiles = fs.readdirSync(process.cwd());
              logger.warn({ msg: "no file in temp, checking cwd", cwdFiles });
              const cwdf = cwdFiles.find((f) => f.includes(id));
              if (cwdf) return resolve(path.join(process.cwd(), cwdf));
              // if we have attempts remaining, retry with backoff
              if (attempt < maxAttempts) {
                const backoff = 500 * Math.pow(2, attempt - 1);
                logger.info({ msg: 'retrying download', attempt: attempt + 1, backoff });
                await new Promise((r) => setTimeout(r, backoff));
                return tryDownload();
              }
              clearTimeout(timer);
              return reject(new Error("download failed: no file"));
            }
          }
          resolve(path.join(this.tempDir, match));
        }
        catch (err: any) {
          clearTimeout(timer);
          logger.error({ msg: 'download attempt failed', err: (err && (err.stack || err.message)) || String(err), stderr: err?.stderr, stdout: err?.stdout });
          if (attempt < maxAttempts) {
            const backoff = 500 * Math.pow(2, attempt - 1);
            logger.info({ msg: 'retrying after failure', attempt: attempt + 1, backoff });
            await new Promise((r) => setTimeout(r, backoff));
            return tryDownload();
          }
          return reject(err);
        }
      };
      // start attempts
      tryDownload();
    });
  }

  async trimToMp3(inputFile: string, startSec: number, durationSec: number) {
    const outName = `${uuidv4()}.mp3`;
    const outPath = path.join(this.tempDir, outName);
    logger.info({ msg: "trimming", inputFile, startSec, durationSec, outPath });
    return new Promise<string>((resolve, reject) => {
      ffmpeg(inputFile)
        .setStartTime(startSec)
        .duration(durationSec)
        .audioCodec("libmp3lame")
        .format("mp3")
        .on("error", (err: any) => reject(err))
        .on("end", () => resolve(outPath))
        .save(outPath);
    });
  }

  async cleanup(...paths: string[]) {
    for (const p of paths) {
      try {
        if (!p) continue;
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (e) {
        logger.warn({ msg: "cleanup failed", path: p, err: e });
      }
    }
  }
}
