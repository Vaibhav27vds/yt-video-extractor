import { Request, Response, NextFunction } from "express";
import { SERVICE_API_KEY } from "../config";
import logger from "../utils/logger";

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const auth = req.header("authorization") || req.header("Authorization");
  if (!SERVICE_API_KEY) {
    logger.warn("SERVICE_API_KEY not configured - rejecting requests");
    return res.status(500).json({ success: false, error: "server misconfigured" });
  }
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "missing auth" });
  }
  const token = auth.slice("Bearer ".length);
  if (token !== SERVICE_API_KEY) {
    return res.status(403).json({ success: false, error: "invalid api key" });
  }
  next();
}
