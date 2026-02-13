import dotenv from "dotenv";
dotenv.config();

export const PORT = process.env.PORT || 3000;
export const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
export const SERVICE_API_KEY = process.env.SERVICE_API_KEY || process.env.API_KEY || "";
export const TEMP_DIR = process.env.TEMP_DIR || "tmp";
export const STORAGE_BUCKET = process.env.STORAGE_BUCKET || "audio";
export const MAX_SEGMENT_SECONDS = 60 * 10; // 10 minutes
export const REQUEST_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const CONCURRENCY = parseInt(process.env.CONCURRENCY || "2", 10);
