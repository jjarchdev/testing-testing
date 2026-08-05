import dotenv from "dotenv";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
if (existsSync(envPath)) dotenv.config({ path: envPath });

const BUCKET = "scenario-images";

const url = (process.env.SUPABASE_URL || "").trim();
const key = (
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ""
).trim();

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env");
  process.exit(1);
}

if (!(process.env.SUPABASE_SECRET_KEY || "").trim() && (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()) {
  console.warn(
    "Using legacy SUPABASE_SERVICE_ROLE_KEY; rename to SUPABASE_SECRET_KEY (sb_secret_...)."
  );
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cats = await sb.from("categories").select("slug", { count: "exact", head: true });
const scens = await sb.from("scenarios").select("id", { count: "exact", head: true });
const imageUrlsCol = await sb.from("scenarios").select("id, image_url, image_urls").limit(50);

function formatErr(error) {
  if (!error) return null;
  return `${error.message}${error.hint ? ` (${error.hint})` : ""}${error.code ? ` [${error.code}]` : ""}`;
}

if (cats.error || scens.error) {
  console.error("Supabase check failed.");
  if (cats.error) console.error("categories:", formatErr(cats.error));
  if (scens.error) console.error("scenarios:", formatErr(scens.error));
  console.error(
    "If permission denied, grant privileges to service_role (see DEPLOY.md). If relation missing, run supabase/migrations/001_schema.sql."
  );
  process.exit(1);
}

let schemaError = null;
if (imageUrlsCol.error) {
  const msg = imageUrlsCol.error.message || "";
  if (/image_urls|column/i.test(msg)) {
    schemaError =
      "Column image_urls missing. Run supabase/migrations/004_scenario_images.sql in the Supabase SQL Editor.";
  } else {
    schemaError = formatErr(imageUrlsCol.error);
  }
}

const rows = imageUrlsCol.error ? [] : imageUrlsCol.data || [];
const legacyRows = [];
for (const row of rows) {
  if (typeof row.image_url === "string" && row.image_url.startsWith("/uploads/")) {
    legacyRows.push({ id: row.id, path: row.image_url });
  }
  if (Array.isArray(row.image_urls)) {
    for (const u of row.image_urls) {
      if (typeof u === "string" && u.startsWith("/uploads/")) {
        legacyRows.push({ id: row.id, path: u });
      }
    }
  }
}

let storageBucket = null;
let storagePublic = null;
let storageError = null;

const listed = await sb.storage.listBuckets();
if (listed.error) {
  storageError = formatErr(listed.error);
} else {
  const bucket = (listed.data || []).find((b) => b.name === BUCKET);
  if (!bucket) {
    storageError = `Bucket '${BUCKET}' not found. Create a public bucket (see supabase/STORAGE.md) or upload once so the API can create it.`;
  } else {
    storageBucket = bucket.name;
    storagePublic = bucket.public === true;
    if (!storagePublic) {
      storageError = `Bucket '${BUCKET}' is private. Make it public so employees can load images.`;
    }
  }
}

const legacyCount = legacyRows.length;
const ok = !storageError && !schemaError;

const report = {
  ok,
  host: new URL(url).host,
  keyType: key.startsWith("sb_secret_") ? "secret" : key.startsWith("eyJ") ? "legacy_jwt" : "other",
  categories: cats.count ?? 0,
  scenarios: scens.count ?? 0,
  storageBucket,
  storagePublic,
  legacyUploadPaths: legacyCount,
  imageUrlsColumn: !imageUrlsCol.error,
  ...(storageError ? { storageError } : {}),
  ...(schemaError ? { schemaError } : {}),
};

console.log(JSON.stringify(report, null, 2));

if (schemaError) {
  console.error(schemaError);
}

if (legacyCount > 0) {
  console.warn(
    `Found ${legacyCount} legacy /uploads/... path(s). Re-upload those images in Admin (relative paths do not work on Render).`
  );
  for (const row of legacyRows.slice(0, 20)) {
    console.warn(`  id=${row.id} path=${row.path}`);
  }
}

if (!ok) {
  if (storageError) console.error(storageError);
  process.exit(1);
}
