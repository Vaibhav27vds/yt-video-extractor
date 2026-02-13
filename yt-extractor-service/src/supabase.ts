import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./config";
import fs from "fs";
import path from "path";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // allow module to import but will error when used
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function uploadFile(bucket: string, destPath: string, localFile: string) {
  const file = fs.readFileSync(localFile);
  const { data, error } = await supabase.storage.from(bucket).upload(destPath, file, {
    contentType: "audio/mpeg",
    upsert: false
  });
  if (error) throw error;
  // getPublicUrl returns { data: { publicUrl } }
  const pub = supabase.storage.from(bucket).getPublicUrl(destPath);
  return { publicUrl: pub.data.publicUrl, storagePath: destPath };
}
