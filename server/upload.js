import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getSupabase, isSupabaseConfigured } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
export const UPLOADS_DIR = path.join(ROOT, "data", "uploads");
export const STORAGE_BUCKET = "scenario-images";
const BUCKET = STORAGE_BUCKET;
export const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const UPLOAD_TIMEOUT_MS = 45_000;

export function assertImageFile(file) {
  if (!file) throw new Error("No file uploaded");
  if (!ALLOWED.has(file.mimetype)) {
    throw new Error("Only JPEG, PNG, WebP, or GIF images are allowed");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Image must be 10MB or smaller");
  }
}

function extForMime(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function ensureScenarioImagesBucket(sb = getSupabase()) {
  if (!sb) throw new Error("Supabase is not configured");

  let buckets;
  try {
    const listed = await withTimeout(
      sb.storage.listBuckets(),
      UPLOAD_TIMEOUT_MS,
      "Timed out listing Storage buckets. Check SUPABASE_URL and SUPABASE_SECRET_KEY."
    );
    if (listed.error) {
      console.warn("[upload] listBuckets:", listed.error.message || listed.error);
      return;
    }
    buckets = listed.data || [];
  } catch (e) {
    console.warn("[upload] listBuckets failed:", e?.message || e);
    return;
  }

  const existing = buckets.find((b) => b.name === BUCKET);
  if (existing) {
    const { error: updateError } = await sb.storage.updateBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
    });
    if (updateError) {
      if (existing.public === false) {
        throw new Error(
          `Storage bucket '${BUCKET}' exists but is private. Make it public in Supabase Storage (employees need anonymous read). ${updateError.message || ""}`.trim()
        );
      }
      console.warn("[upload] updateBucket:", updateError.message || updateError);
    }
    return;
  }

  const { error: createError } = await sb.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: [...ALLOWED],
  });
  if (createError && !/already exists|duplicate/i.test(createError.message || "")) {
    throw new Error(
      `Could not create public Storage bucket '${BUCKET}': ${createError.message || "unknown error"}. Create it manually (see supabase/STORAGE.md).`
    );
  }
}

export async function saveUploadedImage(file) {
  assertImageFile(file);
  const ext = extForMime(file.mimetype);
  const name = `${Date.now()}-${randomUUID()}.${ext}`;
  const bytes = file.buffer instanceof Uint8Array ? file.buffer : new Uint8Array(file.buffer);

  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    await ensureScenarioImagesBucket(sb);

    const objectPath = `scenarios/${name}`;
    const uploadPromise = sb.storage.from(BUCKET).upload(objectPath, bytes, {
      contentType: file.mimetype,
      upsert: false,
      duplex: "half",
    });

    const { error } = await withTimeout(
      uploadPromise,
      UPLOAD_TIMEOUT_MS,
      "Upload timed out talking to Supabase Storage. Check the scenario-images bucket exists and is public."
    );

    if (error) {
      const msg = error.message || "Upload failed";
      if (/bucket|not found|404|No such/i.test(msg)) {
        throw new Error(
          "Storage bucket 'scenario-images' missing. Create a public bucket named scenario-images in Supabase Storage."
        );
      }
      if (/row-level security|policy|permission|unauthorized|403/i.test(msg)) {
        throw new Error(
          "Storage permission denied. Use the secret key (SUPABASE_SECRET_KEY) and a public scenario-images bucket."
        );
      }
      throw new Error(msg);
    }

    const { data } = sb.storage.from(BUCKET).getPublicUrl(objectPath);
    if (!data?.publicUrl) throw new Error("Could not resolve public URL");

    const verifyRes = await withTimeout(
      fetch(data.publicUrl, { method: "HEAD" }).catch(() => null),
      8_000,
      "verify-timeout"
    ).catch(() => null);
    if (verifyRes && (verifyRes.status === 401 || verifyRes.status === 403)) {
      throw new Error(
        "Image uploaded, but the storage bucket isn't publicly readable yet. Run the SQL in supabase/STORAGE.md to add the public-read policy for 'scenario-images', then try again."
      );
    }

    return data.publicUrl;
  }

  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, name), Buffer.from(bytes));
  return `/uploads/${name}`;
}

export function imageUrlsFromScenario(scenario) {
  if (!scenario) return [];
  if (Array.isArray(scenario.image_urls) && scenario.image_urls.length) {
    return scenario.image_urls.filter((u) => typeof u === "string" && u.trim());
  }
  if (typeof scenario.image_url === "string" && scenario.image_url.trim()) {
    return [scenario.image_url.trim()];
  }
  return [];
}

export function urlsRemovedFromScenario(previous, nextUrls) {
  const before = new Set(imageUrlsFromScenario(previous));
  const after = new Set(
    Array.isArray(nextUrls) ? nextUrls.filter((u) => typeof u === "string" && u.trim()) : []
  );
  return [...before].filter((u) => !after.has(u));
}

export function storageObjectPathFromPublicUrl(url) {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const u = new URL(url.trim());
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx < 0) return null;
    const objectPath = decodeURIComponent(u.pathname.slice(idx + marker.length));
    if (!objectPath || objectPath.includes("..")) return null;
    return objectPath;
  } catch {
    return null;
  }
}

export async function removeStoredImages(urls) {
  const list = Array.isArray(urls) ? urls : [];
  const storagePaths = [];
  const localNames = [];

  for (const url of list) {
    if (typeof url !== "string") continue;
    const trimmed = url.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("/uploads/")) {
      const name = trimmed.slice("/uploads/".length);
      if (name && !name.includes("..") && !name.includes("/") && !name.includes("\\")) {
        localNames.push(name);
      }
      continue;
    }
    const objectPath = storageObjectPathFromPublicUrl(trimmed);
    if (objectPath) storagePaths.push(objectPath);
  }

  if (storagePaths.length && isSupabaseConfigured()) {
    try {
      const sb = getSupabase();
      const { error } = await sb.storage.from(BUCKET).remove(storagePaths);
      if (error) {
        console.warn("[upload] storage remove:", error.message || error);
      }
    } catch (e) {
      console.warn("[upload] storage remove failed:", e?.message || e);
    }
  }

  for (const name of localNames) {
    try {
      await fs.unlink(path.join(UPLOADS_DIR, name));
    } catch (e) {
      if (e?.code !== "ENOENT") {
        console.warn("[upload] local remove failed:", name, e?.message || e);
      }
    }
  }
}
