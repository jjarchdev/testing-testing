import dotenv from "dotenv";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import express from "express";
import multer from "multer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const envPath = path.join(ROOT, ".env");
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const {
  isSupabaseConfigured,
  usingLegacySupabaseKeyEnv,
  listPublishedScenarios,
  listAllScenarios,
  insertScenario,
  updateScenario,
  deleteScenarioById,
  listCategories,
  insertCategory,
  updateCategory,
  deleteCategory,
  isConfluencePagePublic,
  checkImageUrlsReady,
} = await import("./db.js");
const {
  readScenariosFromDisk,
  writeScenariosToDisk,
  readCategoriesFromDisk,
  insertCategoryOnDisk,
  updateCategoryOnDisk,
  deleteCategoryOnDisk,
  resolveCategoryLabelOnDisk,
  withPublishedDefault,
} = await import("./fileStore.js");
const {
  normalizeScenario,
  sanitizeImageUrls,
  sanitizeTranslations,
  isLocalUploadPath,
  MAX_SCENARIO_IMAGES,
  SUPPORTED_SCENARIO_LOCALES,
  sanitizeConfluencePageId,
  sanitizeConfluenceUrl,
  parseVerdict,
  coerceSolutionAsChecklist,
} = await import("../shared/scenarioSchema.mjs");
const { normalizeCategory, sanitizeWp } = await import("../shared/categoryMap.mjs");
const {
  saveUploadedImage,
  UPLOADS_DIR,
  removeStoredImages,
  imageUrlsFromScenario,
  urlsRemovedFromScenario,
  MAX_BYTES,
} = await import("./upload.js");
const { encryptionKeySource, safeStringEquals } = await import("./secrets.js");
const {
  cloudConfigured,
  completeCloudOauth,
  deleteConnection,
  fetchPageById,
  getCloudAuthorizeUrl,
  getConnectionStatus,
  saveDcConnection,
  searchPages,
} = await import("./confluence.js");
const {
  verifySupabaseAccessToken,
  isAllowedAdmin,
  tryAutoBootstrap,
  listAdmins,
  inviteAdmin,
  revokeAdmin,
  normalizeEmail,
} = await import("./auth.js");

const isProd = process.env.NODE_ENV === "production";
const adminPassword =
  (process.env.ADMIN_PASSWORD || "").trim() || (!isProd ? "admin123" : "");
const adminUser = (process.env.ADMIN_USER || "").trim();
const jwtSecret =
  (process.env.JWT_SECRET || "").trim() || (!isProd ? "dev-jwt-secret" : "");
const ADMIN_COOKIE = "qm_admin";
const SESSION_MAX_AGE_SEC = 8 * 60 * 60;

function envLoginAvailable() {
  return adminPassword.length > 0 && jwtSecret.length > 0;
}

function authConfigured() {
  if (!jwtSecret) return false;
  return envLoginAvailable() || isSupabaseConfigured();
}

function storageMode() {
  return isSupabaseConfigured() ? "supabase" : "file";
}

function requireSupabaseInProd(res) {
  if (isProd && !isSupabaseConfigured()) {
    res.status(503).json({ error: "Supabase is required in production" });
    return true;
  }
  return false;
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = Object.create(null);
  if (!header || typeof header !== "string") return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

function readAdminToken(req) {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ") && h.length > 7) {
    return h.slice(7).trim();
  }
  const cookies = parseCookies(req);
  return typeof cookies[ADMIN_COOKIE] === "string" ? cookies[ADMIN_COOKIE] : "";
}

function verifyAdminToken(token) {
  if (!token || !jwtSecret) return null;
  try {
    return jwt.verify(token, jwtSecret);
  } catch {
    return null;
  }
}

function currentAdminEmail(req) {
  const payload = verifyAdminToken(readAdminToken(req));
  return payload?.email ? String(payload.email) : null;
}

function setAdminCookie(res, token) {
  const parts = [
    `${ADMIN_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SEC}`,
  ];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearAdminCookie(res) {
  const parts = [
    `${ADMIN_COOKIE}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function requireAuth(req, res, next) {
  if (!verifyAdminToken(readAdminToken(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function isAdminRequest(req) {
  return !!verifyAdminToken(readAdminToken(req));
}

async function listScenariosForRequest(req) {
  const admin = isAdminRequest(req);
  if (isSupabaseConfigured()) {
    return admin ? listAllScenarios() : listPublishedScenarios();
  }
  const list = await readScenariosFromDisk();
  if (!list) return null;
  if (admin) return list;
  return list.filter((s) => s.is_published !== false);
}

function parseScenarioBody(body) {
  const tags = Array.isArray(body?.tags)
    ? body.tags.map((t) => String(t).trim()).filter(Boolean)
    : typeof body?.tags === "string"
      ? body.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

  const allowLocalUploads = !isSupabaseConfigured();
  const rawList = Array.isArray(body?.image_urls)
    ? body.image_urls
    : null;
  const legacySingle =
    typeof body?.image_url === "string" && body.image_url.trim()
      ? body.image_url.trim()
      : "";
  const candidates =
    rawList && rawList.length > 0
      ? rawList
      : legacySingle
        ? [legacySingle]
        : rawList || [];

  if (candidates.length > MAX_SCENARIO_IMAGES) {
    const err = new Error(`At most ${MAX_SCENARIO_IMAGES} images are allowed per scenario`);
    err.code = "TOO_MANY_IMAGES";
    throw err;
  }

  if (isSupabaseConfigured() && candidates.some((u) => isLocalUploadPath(u))) {
    const err = new Error(
      "Local /uploads/ image paths do not work in production. Use Upload image so the file is stored in Supabase Storage."
    );
    err.code = "LEGACY_UPLOAD_PATH";
    throw err;
  }

  const image_urls = sanitizeImageUrls(candidates, { allowLocalUploads });
  const translations = sanitizeTranslations(body?.translations);
  const primaryLanguage =
    typeof body?.primary_language === "string" &&
    SUPPORTED_SCENARIO_LOCALES.includes(body.primary_language)
      ? body.primary_language
      : null;

  const translationOrder = [primaryLanguage, "en", "de", "sq"].filter(
    (l, i, arr) => l && arr.indexOf(l) === i
  );
  let derivedTitle = typeof body?.title === "string" ? body.title : "";
  let derivedScenario = typeof body?.scenario === "string" ? body.scenario : "";
  let derivedSolution = typeof body?.solution === "string" ? body.solution : "";
  let derivedTags = tags;
  if (!derivedTitle.trim() || !derivedScenario.trim() || !derivedSolution.trim()) {
    for (const lng of translationOrder) {
      const slot = translations[lng];
      if (!slot) continue;
      if (!derivedTitle.trim() && slot.title) derivedTitle = slot.title;
      if (!derivedScenario.trim() && slot.scenario) derivedScenario = slot.scenario;
      if (!derivedSolution.trim() && slot.solution) derivedSolution = slot.solution;
      if (derivedTags.length === 0 && slot.tags?.length) derivedTags = slot.tags;
      if (derivedTitle.trim() && derivedScenario.trim() && derivedSolution.trim()) break;
    }
  }

  const verdictParsed = parseVerdict(body?.verdict);
  if (verdictParsed === undefined) {
    const err = new Error("Invalid verdict");
    err.code = "INVALID_VERDICT";
    throw err;
  }
  if (!verdictParsed) {
    const err = new Error("Verdict required");
    err.code = "VERDICT_REQUIRED";
    throw err;
  }
  const verdict = verdictParsed;

  const row = {
    category: body?.category,
    title: derivedTitle,
    scenario: derivedScenario,
    solution: derivedSolution,
    tags: derivedTags,
    image_urls,
    image_url: image_urls[0] || "",
    translations,
    primary_language: primaryLanguage,
    confluence_page_id: sanitizeConfluencePageId(body?.confluence_page_id),
    confluence_page_url: sanitizeConfluenceUrl(body?.confluence_page_url),
    confluence_page_title:
      typeof body?.confluence_page_title === "string"
        ? body.confluence_page_title.slice(0, 240)
        : "",
    is_published: body?.is_published !== false && body?.is_published !== "false",
    solution_as_checklist: coerceSolutionAsChecklist(body?.solution_as_checklist),
    acceptance_as_checklist: coerceSolutionAsChecklist(body?.acceptance_as_checklist),
    verdict,
  };
  const normalized = normalizeScenario(
    {
      id: 1,
      ...row,
      tags: derivedTags,
    },
    { allowLocalUploads }
  );
  if (!normalized) return null;
  normalized.primary_language = primaryLanguage;
  return normalized;
}

function parseCategoryBody(body) {
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label) return null;
  const sort_order =
    body?.sort_order != null && Number.isFinite(Number(body.sort_order))
      ? Number(body.sort_order)
      : undefined;
  const slug = typeof body?.slug === "string" ? body.slug.trim() : undefined;
  const wp = sanitizeWp(body?.wp);
  return { label, sort_order, slug, wp };
}

const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS = 10;
const LOGIN_ATTEMPTS_MAX_ENTRIES = 5000;

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function evictOldAttempts(now) {
  for (const [ip, entry] of loginAttempts) {
    if (now - entry.windowStart > LOGIN_WINDOW_MS) loginAttempts.delete(ip);
  }
  if (loginAttempts.size > LOGIN_ATTEMPTS_MAX_ENTRIES) {
    const drop = Math.floor(loginAttempts.size * 0.2);
    let i = 0;
    for (const ip of loginAttempts.keys()) {
      if (i++ >= drop) break;
      loginAttempts.delete(ip);
    }
  }
}

function loginBlocked(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (now - entry.windowStart > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= LOGIN_MAX_FAILS;
}

function recordLoginFailure(ip) {
  const now = Date.now();
  evictOldAttempts(now);
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { windowStart: now, count: 1 });
  } else {
    entry.count += 1;
  }
}

function clearLoginFailures(ip) {
  loginAttempts.delete(ip);
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

function supabaseConnectOrigin() {
  const raw = (process.env.SUPABASE_URL || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && !(u.protocol === "http:" && !isProd)) return "";
    return u.origin;
  } catch {
    return "";
  }
}

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  const connectSrc = ["'self'", supabaseConnectOrigin()].filter(Boolean).join(" ");
  const csp = [
    "default-src 'self'",
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "script-src 'self'",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  res.setHeader("Content-Security-Policy", csp);
  if (isProd) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

function detectImageMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  )
    return "image/png";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  )
    return "image/webp";
  if (
    buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61
  )
    return "image/gif";
  return null;
}

app.post("/api/uploads/image", requireAuth, (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      const msg =
        err.code === "LIMIT_FILE_SIZE" ? "Image must be 10MB or smaller" : err.message || "Upload failed";
      return res.status(400).json({ error: msg });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const detected = detectImageMime(req.file.buffer);
    if (!detected) {
      return res.status(400).json({
        error: "File is not a valid JPEG, PNG, WebP, or GIF image.",
      });
    }
    req.file.mimetype = detected;
    try {
      const url = await saveUploadedImage(req.file);
      return res.status(201).json({ url });
    } catch (e) {
      console.error("[upload]", e);
      return res.status(400).json({ error: e.message || "Upload failed" });
    }
  });
});

app.use(express.json({ limit: "5mb" }));
app.use(
  "/uploads",
  express.static(UPLOADS_DIR, { fallthrough: false, maxAge: isProd ? "1d" : 0 })
);

app.get("/api/health", async (_req, res) => {
  let imageUrlsReady = true;
  try {
    imageUrlsReady = await checkImageUrlsReady();
  } catch {
    imageUrlsReady = !isSupabaseConfigured();
  }
  res.json({
    ok: true,
    storage: storageMode(),
    supabaseConfigured: isSupabaseConfigured(),
    productionRequiresSupabase: isProd,
    imageUrlsReady,
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    authConfigured: authConfigured(),
    requireUsername: adminUser.length > 0,
    envLoginAvailable: envLoginAvailable(),
    storage: storageMode(),
    supabaseRequired: isProd && !isSupabaseConfigured(),
    confluenceCloudConfigured: cloudConfigured(),
    supabaseAuthAvailable: isSupabaseConfigured() && !!(process.env.SUPABASE_ANON_KEY || "").trim(),
    supabaseUrl: isSupabaseConfigured() ? process.env.SUPABASE_URL : null,
    supabaseAnonKey: (process.env.SUPABASE_ANON_KEY || "").trim() || null,
    privacyControllerName: (process.env.PRIVACY_CONTROLLER_NAME || "").trim() || null,
    privacyControllerEmail: (process.env.PRIVACY_CONTROLLER_EMAIL || "").trim() || null,
  });
});

app.get("/api/categories", async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  try {
    const categories = isSupabaseConfigured()
      ? await listCategories()
      : await readCategoriesFromDisk();
    if (!categories) {
      return res.status(500).json({ error: "Read failed" });
    }
    res.json({ categories });
  } catch (e) {
    console.error("[categories:list]", e?.message || e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/categories", requireAuth, async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  try {
    const payload = parseCategoryBody(req.body);
    if (!payload) {
      return res.status(400).json({ error: "Invalid category" });
    }
    const category = isSupabaseConfigured()
      ? await insertCategory(payload)
      : await insertCategoryOnDisk(payload);
    res.status(201).json({ category });
  } catch (e) {
    console.error("[categories:create]", e?.message || e);
    res.status(400).json({ error: e.message || "Create failed" });
  }
});

app.put("/api/categories/:slug", requireAuth, async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  const slug = String(req.params.slug || "").trim();
  if (!slug) {
    return res.status(400).json({ error: "Invalid slug" });
  }
  try {
    const label =
      typeof req.body?.label === "string" && req.body.label.trim()
        ? req.body.label.trim()
        : undefined;
    const sort_order =
      req.body?.sort_order != null && Number.isFinite(Number(req.body.sort_order))
        ? Number(req.body.sort_order)
        : undefined;
    const hasWp = Object.prototype.hasOwnProperty.call(req.body || {}, "wp");
    const wp = hasWp ? sanitizeWp(req.body.wp) : undefined;
    if (label === undefined && sort_order === undefined && !hasWp) {
      return res.status(400).json({ error: "Nothing to update" });
    }
    const payload = { label, sort_order };
    if (hasWp) payload.wp = wp;
    const category = isSupabaseConfigured()
      ? await updateCategory(slug, payload)
      : await updateCategoryOnDisk(slug, payload);
    if (!category) return res.status(404).json({ error: "Not found" });
    res.json({ category: normalizeCategory(category) });
  } catch (e) {
    console.error("[handler] update:", e?.message || e);
    res.status(400).json({ error: e.message || "Update failed" });
  }
});

app.delete("/api/categories/:slug", requireAuth, async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  const slug = String(req.params.slug || "").trim();
  if (!slug) {
    return res.status(400).json({ error: "Invalid slug" });
  }
  try {
    const result = isSupabaseConfigured()
      ? await deleteCategory(slug)
      : await deleteCategoryOnDisk(slug);
    if (result.reason === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    if (result.reason === "in_use") {
      return res.status(409).json({
        error: `Category is used by ${result.count} scenario(s)`,
        count: result.count,
      });
    }
    res.status(204).send();
  } catch (e) {
    console.error("[handler] delete:", e?.message || e);
    res.status(400).json({ error: e.message || "Delete failed" });
  }
});

app.get("/api/scenarios", async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  try {
    const scenarios = await listScenariosForRequest(req);
    if (!scenarios) {
      return res.status(500).json({ error: "Read failed" });
    }
    res.json({ scenarios });
  } catch (e) {
    console.error("[handler] read:", e?.message || e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/scenarios", requireAuth, async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  try {
    const payload = parseScenarioBody(req.body);
    if (!payload) {
      return res.status(400).json({ error: "Invalid scenario" });
    }
    if (isSupabaseConfigured()) {
      const scenario = await insertScenario(payload);
      return res.status(201).json({ scenario });
    }
    const categories = await readCategoriesFromDisk();
    if (!categories) return res.status(500).json({ error: "Read failed" });
    const categoryLabel = resolveCategoryLabelOnDisk(categories, payload.category);
    const list = (await readScenariosFromDisk()) || [];
    const nextId = list.reduce((max, s) => Math.max(max, s.id), 0) + 1;
    const scenario = withPublishedDefault(
      { id: nextId, ...payload, category: categoryLabel },
      payload.is_published !== false
    );
    const written = await writeScenariosToDisk([...list, scenario]);
    const saved = written.find((s) => s.id === nextId) || scenario;
    res.status(201).json({ scenario: saved });
  } catch (e) {
    console.error("[handler] create:", e?.message || e);
    res.status(400).json({ error: e.message || "Create failed" });
  }
});

app.put("/api/scenarios/:id", requireAuth, async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: "Invalid id" });
  }
  try {
    const payload = parseScenarioBody(req.body);
    if (!payload) {
      return res.status(400).json({ error: "Invalid scenario" });
    }
    if (isSupabaseConfigured()) {
      const scenario = await updateScenario(id, payload);
      if (!scenario) return res.status(404).json({ error: "Not found" });
      return res.json({ scenario });
    }
    const categories = await readCategoriesFromDisk();
    if (!categories) return res.status(500).json({ error: "Read failed" });
    const categoryLabel = resolveCategoryLabelOnDisk(categories, payload.category);
    const list = (await readScenariosFromDisk()) || [];
    const previous = list.find((s) => s.id === id);
    if (!previous) {
      return res.status(404).json({ error: "Not found" });
    }
    const scenario = withPublishedDefault(
      { id, ...payload, category: categoryLabel },
      payload.is_published !== false
    );
    const next = list.map((s) => (s.id === id ? scenario : s));
    const written = await writeScenariosToDisk(next);
    await removeStoredImages(urlsRemovedFromScenario(previous, scenario.image_urls));
    const saved = written.find((s) => s.id === id) || scenario;
    res.json({ scenario: saved });
  } catch (e) {
    console.error("[handler] update:", e?.message || e);
    res.status(400).json({ error: e.message || "Update failed" });
  }
});

app.delete("/api/scenarios/:id", requireAuth, async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: "Invalid id" });
  }
  try {
    if (isSupabaseConfigured()) {
      await deleteScenarioById(id);
      return res.status(204).send();
    }
    const list = (await readScenariosFromDisk()) || [];
    const previous = list.find((s) => s.id === id);
    if (!previous) {
      return res.status(404).json({ error: "Not found" });
    }
    await writeScenariosToDisk(list.filter((s) => s.id !== id));
    await removeStoredImages(imageUrlsFromScenario(previous));
    res.status(204).send();
  } catch (e) {
    console.error("[handler] delete:", e?.message || e);
    res.status(400).json({ error: e.message || "Delete failed" });
  }
});

app.post("/api/auth/login", (req, res) => {
  if (!envLoginAvailable()) {
    return res.status(503).json({
      error: "Env login is not configured. Set ADMIN_PASSWORD (and JWT_SECRET).",
    });
  }
  const ip = clientIp(req);
  if (loginBlocked(ip)) {
    return res.status(429).json({ error: "Too many failed attempts. Try again later." });
  }
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";

  let ok = safeStringEquals(password, adminPassword);
  if (adminUser) {
    ok = ok && safeStringEquals(username, adminUser);
  }
  if (!ok) {
    recordLoginFailure(ip);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  clearLoginFailures(ip);
  const jwtToken = jwt.sign(
    { role: "admin", auth: "env", sub: "env-admin", username: adminUser || null },
    jwtSecret,
    { expiresIn: "8h" }
  );
  setAdminCookie(res, jwtToken);
  res.json({ ok: true, auth: "env" });
});

app.post("/api/auth/session", async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  const ip = clientIp(req);
  if (loginBlocked(ip)) {
    return res.status(429).json({ error: "Too many failed attempts. Try again later." });
  }
  const token = typeof req.body?.access_token === "string" ? req.body.access_token : "";
  if (!token) {
    recordLoginFailure(ip);
    return res.status(400).json({ error: "Missing access_token" });
  }
  try {
    const user = await verifySupabaseAccessToken(token);
    if (!user) {
      recordLoginFailure(ip);
      return res.status(401).json({ error: "Invalid or expired session" });
    }
    let allowed = await isAllowedAdmin(user.email);
    let bootstrapped = false;
    if (!allowed) {
      bootstrapped = await tryAutoBootstrap(user.email);
      if (bootstrapped) allowed = true;
    }
    if (!allowed) {
      recordLoginFailure(ip);
      return res.status(403).json({
        error:
          "Your account is not on the admin allowlist. Ask an existing admin to invite you.",
      });
    }
    clearLoginFailures(ip);
    const jwtToken = jwt.sign(
      { role: "admin", email: user.email, sub: user.id },
      jwtSecret,
      { expiresIn: "8h" }
    );
    setAdminCookie(res, jwtToken);
    res.json({ ok: true, email: user.email, bootstrapped });
  } catch (e) {
    console.error("[auth:session]", e?.message || e);
    res.status(500).json({ error: "Session exchange failed" });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const payload = verifyAdminToken(readAdminToken(req));
  if (!payload) return res.json({ admin: false });
  res.json({
    admin: true,
    email: payload.email || null,
  });
});

app.get("/api/admin/admins", requireAuth, async (_req, res) => {
  if (requireSupabaseInProd(res)) return;
  try {
    const admins = await listAdmins();
    res.json({ admins });
  } catch (e) {
    console.error("[admins:list]", e?.message || e);
    const msg = String(e?.message || e?.details || "");
    if (/app_admins|relation|42P01|does not exist/i.test(msg)) {
      return res.status(503).json({
        error:
          "Admin table missing. Run supabase/migrations/004_admins.sql in the Supabase SQL Editor, then retry.",
      });
    }
    if (/permission denied|42501|row-level security/i.test(msg)) {
      return res.status(503).json({
        error:
          "No permission to read app_admins. Grant the secret/service_role key access (see DEPLOY.md).",
      });
    }
    res.status(500).json({ error: "Read failed" });
  }
});

app.post("/api/admin/admins", requireAuth, async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({ error: "Supabase is required to invite admins" });
    }
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    const origin =
      typeof req.body?.origin === "string" && req.body.origin.trim()
        ? req.body.origin.trim().replace(/\/+$/, "")
        : `${req.protocol}://${req.get("host")}`.replace(/\/+$/, "");
    const lng =
      typeof req.body?.language === "string" && /^[a-z]{2}$/i.test(req.body.language)
        ? req.body.language.toLowerCase()
        : "en";
    const redirectTo = `${origin}/${lng}/admin/reset`;
    const admin = await inviteAdmin({
      email,
      invitedBy: currentAdminEmail(req),
      redirectTo,
    });
    res.status(201).json({ admin });
  } catch (e) {
    console.error("[admins:invite]", e?.message || e);
    res.status(e?.status || 400).json({ error: e.message || "Invite failed" });
  }
});

app.delete("/api/admin/admins/:email", requireAuth, async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  try {
    const target = normalizeEmail(decodeURIComponent(req.params.email || ""));
    if (!target) return res.status(400).json({ error: "Invalid email" });
    const acting = normalizeEmail(currentAdminEmail(req) || "");
    if (acting && acting === target) {
      return res.status(400).json({ error: "You cannot revoke your own admin access." });
    }
    await revokeAdmin(target);
    res.status(204).send();
  } catch (e) {
    console.error("[admins:revoke]", e?.message || e);
    res.status(e?.status || 400).json({ error: e.message || "Revoke failed" });
  }
});

app.get("/api/admin/export", requireAuth, async (_req, res) => {
  if (requireSupabaseInProd(res)) return;
  try {
    const [categories, scenarios] = await Promise.all([
      isSupabaseConfigured() ? listCategories() : readCategoriesFromDisk(),
      isSupabaseConfigured() ? listAllScenarios() : readScenariosFromDisk(),
    ]);
    let confluence = { connected: false };
    try {
      const status = await getConnectionStatus();
      confluence = {
        connected: !!status?.connected,
        flavor: status?.flavor || null,
        base_url: status?.base_url || null,
        display_name: status?.display_name || null,
        account_label: status?.account_label || null,
      };
    } catch {
    }
    const payload = {
      exported_at: new Date().toISOString(),
      app: "qm-playbook",
      storage: storageMode(),
      categories: categories || [],
      scenarios: scenarios || [],
      confluence,
    };
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="qm-playbook-export-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.setHeader("Cache-Control", "no-store");
    res.json(payload);
  } catch (e) {
    console.error("[export] failed:", e?.message || e);
    res.status(500).json({ error: "Export failed" });
  }
});

function confluenceError(res, e) {
  const status = e?.status && Number.isFinite(e.status) ? e.status : 500;
  const message = e?.message || "Confluence request failed";
  if (status >= 500) console.error("[confluence]", e);
  res.status(status).json({ error: message });
}

app.get("/api/confluence/status", async (_req, res) => {
  if (requireSupabaseInProd(res)) return;
  try {
    const status = await getConnectionStatus();
    res.json({
      ...status,
      cloud_available: cloudConfigured(),
      encryption_key: encryptionKeySource(),
    });
  } catch (e) {
    confluenceError(res, e);
  }
});

app.get("/api/confluence/connect/cloud", requireAuth, async (_req, res) => {
  if (requireSupabaseInProd(res)) return;
  try {
    if (!cloudConfigured()) {
      return res.status(503).json({
        error:
          "Confluence Cloud OAuth is not configured. Set CONFLUENCE_CLIENT_ID, CONFLUENCE_CLIENT_SECRET, and CONFLUENCE_REDIRECT_URI.",
      });
    }
    const url = await getCloudAuthorizeUrl();
    res.json({ url });
  } catch (e) {
    confluenceError(res, e);
  }
});

app.get("/api/confluence/callback/cloud", async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  const { code, state, error, error_description } = req.query || {};
  const back = "/";
  if (error) {
    return res
      .status(400)
      .type("text/html")
      .send(callbackHtml(`Confluence rejected the connection: ${escapeAttr(String(error_description || error))}`, back));
  }
  if (typeof code !== "string" || typeof state !== "string") {
    return res.status(400).type("text/html").send(callbackHtml("Missing code or state", back));
  }
  try {
    await completeCloudOauth({ code, state });
    res.type("text/html").send(callbackHtml("Confluence connected. You can close this tab.", back, true));
  } catch (e) {
    console.error("[confluence:callback]", e);
    res
      .status(e?.status || 400)
      .type("text/html")
      .send(callbackHtml(`Confluence connection failed: ${escapeAttr(e?.message || "unknown error")}`, back));
  }
});

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function callbackHtml(message, back, ok = false) {
  const color = ok ? "#1abc9c" : "#e67e22";
  return `<!doctype html><html><head><meta charset="utf-8"><title>Confluence</title>
<style>body{font-family:system-ui,sans-serif;background:#0d1520;color:#eaf0fb;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:2rem}
.box{max-width:520px;padding:2rem;background:#0f1923;border:1px solid #1a2a3a;border-radius:12px;text-align:center}
h1{margin:0 0 1rem;color:${color};font-size:1.2rem}
a{color:#4fa3ff}</style></head><body>
<div class="box"><h1>${escapeAttr(message)}</h1>
<p><a href="${escapeAttr(back)}">Return to app</a></p>
<script>try{if(window.opener){window.opener.postMessage({type:'qm-confluence-callback',ok:${ok ? "true" : "false"}},'*');}}catch(e){}</script>
</div></body></html>`;
}

app.post("/api/confluence/connect/dc", requireAuth, async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  try {
    const baseUrl = typeof req.body?.base_url === "string" ? req.body.base_url : "";
    const pat = typeof req.body?.personal_access_token === "string" ? req.body.personal_access_token : "";
    const username = typeof req.body?.username === "string" ? req.body.username : "";
    await saveDcConnection({ baseUrl, personalAccessToken: pat, username });
    res.json({ ok: true });
  } catch (e) {
    confluenceError(res, e);
  }
});

app.delete("/api/confluence/disconnect", requireAuth, async (_req, res) => {
  if (requireSupabaseInProd(res)) return;
  try {
    await deleteConnection();
    res.json({ ok: true });
  } catch (e) {
    confluenceError(res, e);
  }
});

app.get("/api/confluence/search", requireAuth, async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  try {
    const q = typeof req.query?.q === "string" ? req.query.q : "";
    const results = await searchPages(q);
    res.json(results);
  } catch (e) {
    confluenceError(res, e);
  }
});

app.get("/api/confluence/page/:id", async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  const pageId = String(req.params.id || "").trim();
  if (!/^[a-zA-Z0-9_.:-]{1,64}$/.test(pageId)) {
    return res.status(400).json({ error: "Invalid page id" });
  }
  try {
    const admin = isAdminRequest(req);
    if (!admin) {
      const allowed = isSupabaseConfigured() ? await isConfluencePagePublic(pageId) : false;
      if (!allowed) return res.status(404).json({ error: "Not found" });
    }
    const page = await fetchPageById(pageId);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.json({ page });
  } catch (e) {
    confluenceError(res, e);
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

const distPath = path.resolve(ROOT, "dist");
const indexHtml = path.join(distPath, "index.html");
const distReady = existsSync(indexHtml);

function validateDistBundle() {
  if (!distReady) return false;
  const html = readFileSync(indexHtml, "utf8");
  const refs = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  const missing = refs.filter((ref) => !existsSync(path.join(distPath, ref.replace(/^\//, ""))));
  if (missing.length > 0) {
    console.error("[qm-playbook] missing dist assets:", missing.join(", "));
    return false;
  }
  return true;
}

const distBundleOk = distReady && validateDistBundle();

if (distBundleOk) {
  app.use(express.static(distPath, { index: false, maxAge: isProd ? "1h" : 0 }));
  app.get("*", (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) return next();
    const ext = path.extname(req.path);
    if (ext && ext !== ".html") {
      return res.status(404).type("text/plain").send("Not found");
    }
    res.sendFile(indexHtml);
  });
} else if (isProd && distReady) {
  console.error("[qm-playbook] dist bundle invalid");
  app.get("/", (_req, res) => {
    res.status(503).send("Build incomplete");
  });
} else if (isProd) {
  console.error("[qm-playbook] missing dist/index.html");
  app.get("/", (_req, res) => {
    res.status(503).send("Not built");
  });
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = Number.isFinite(err?.status) ? err.status : 500;
  const isApi = req.path.startsWith("/api");
  if (status >= 500) console.error("[error]", err);
  if (isApi || req.path.startsWith("/uploads")) {
    const safeMsg =
      err?.type === "entity.parse.failed"
        ? "Invalid JSON body"
        : err?.type === "entity.too.large"
          ? "Payload too large"
          : status >= 500
            ? "Server error"
            : err?.expose && err?.message
              ? err.message
              : status === 403
                ? "Forbidden"
                : status === 404
                  ? "Not found"
                  : "Request failed";
    return res
      .status(status)
      .type(isApi ? "application/json" : "text/plain")
      .send(isApi ? JSON.stringify({ error: safeMsg }) : safeMsg);
  }
  res
    .status(status)
    .type("text/plain")
    .send(status >= 500 ? "Server error" : "Error");
});

const port = Number(process.env.PORT) || 3001;
if (isProd && (!adminPassword || !jwtSecret)) {
  console.warn("[qm-playbook] ADMIN_PASSWORD and JWT_SECRET required for env login in production");
}
if (isProd && adminPassword && (adminPassword.length < 12 || adminPassword === "admin123")) {
  console.warn("[qm-playbook] ADMIN_PASSWORD looks weak; use a long unique password");
}
if (isProd && jwtSecret && (jwtSecret.length < 32 || jwtSecret === "dev-jwt-secret" || jwtSecret === "dev-only-change-before-production")) {
  console.warn("[qm-playbook] JWT_SECRET looks weak; use a long random secret (32+ chars)");
}
if (isProd && adminPassword && !adminUser) {
  console.warn("[qm-playbook] ADMIN_USER is unset; set it to require a username at login");
}
if (isProd && !(process.env.SUPABASE_ANON_KEY || "").trim()) {
  console.warn("[qm-playbook] SUPABASE_ANON_KEY not set; browser Supabase Auth disabled");
}
if (isProd && !isSupabaseConfigured()) {
  console.error("[qm-playbook] SUPABASE_URL and SUPABASE_SECRET_KEY are required in production");
}
if (isSupabaseConfigured() && usingLegacySupabaseKeyEnv()) {
  console.warn(
    "[qm-playbook] SUPABASE_SERVICE_ROLE_KEY is legacy; set SUPABASE_SECRET_KEY (sb_secret_...) instead"
  );
}
if (encryptionKeySource() === "jwt") {
  console.warn(
    "[qm-playbook] CONFLUENCE_ENCRYPTION_KEY not set; deriving from JWT_SECRET. Rotating JWT_SECRET will invalidate stored Confluence tokens."
  );
}

const host = isProd ? "0.0.0.0" : "127.0.0.1";

if (isProd && !isSupabaseConfigured()) {
  console.error("[qm-playbook] Refusing to start without Supabase in production");
  process.exit(1);
}

const server = app.listen(port, host, () => {
  console.log(
    `[qm-playbook] listening on ${host}:${port} (storage: ${storageMode()}, dist: ${distBundleOk ? "ok" : distReady ? "broken" : "missing"})`
  );
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[qm-playbook] Port ${port} in use.`);
  } else {
    console.error("[qm-playbook] Server failed to start:", err.message);
  }
  process.exit(1);
});
