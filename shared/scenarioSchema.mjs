export const MAX_SCENARIO_IMAGES = 8;

export function isScenarioRecord(s) {
  if (!s || typeof s !== "object") return false;
  const id = Number(s.id);
  if (!Number.isFinite(id) || id < 1) return false;
  for (const k of ["category", "title", "scenario", "solution"]) {
    if (typeof s[k] !== "string") return false;
  }
  if (!Array.isArray(s.tags)) return false;
  if (!s.tags.every((t) => typeof t === "string")) return false;
  if (s.image_url != null && typeof s.image_url !== "string") return false;
  if (s.image_urls != null && !Array.isArray(s.image_urls)) return false;
  if (Array.isArray(s.image_urls) && !s.image_urls.every((u) => typeof u === "string")) {
    return false;
  }
  return true;
}

function sanitizeImageUrl(value, options = {}) {
  const allowLocalUploads = options.allowLocalUploads !== false;
  if (value == null) return "";
  const url = String(value).trim();
  if (!url) return "";
  if (url.startsWith("/uploads/")) {
    return allowLocalUploads ? url : "";
  }
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
  } catch {
    return "";
  }
  return "";
}

/** True when the value is a site-relative upload path that only works with local disk storage. */
export function isLocalUploadPath(value) {
  if (value == null) return false;
  return String(value).trim().startsWith("/uploads/");
}

/**
 * Normalize a list of image URLs (or a legacy single string).
 * Dedupes, sanitizes, and caps at MAX_SCENARIO_IMAGES.
 */
export function sanitizeImageUrls(listOrSingle, options = {}) {
  const max = Number.isFinite(options.max) ? options.max : MAX_SCENARIO_IMAGES;
  let raw = [];
  if (Array.isArray(listOrSingle)) {
    raw = listOrSingle;
  } else if (typeof listOrSingle === "string" && listOrSingle.trim()) {
    raw = [listOrSingle];
  }

  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const url = sanitizeImageUrl(item, options);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

function collectRawImageInputs(s) {
  if (Array.isArray(s?.image_urls) && s.image_urls.length) return s.image_urls;
  if (typeof s?.image_url === "string" && s.image_url.trim()) return [s.image_url];
  // Explicit empty array with no legacy url → no images
  if (Array.isArray(s?.image_urls)) return [];
  return [];
}

function sanitizeConfluencePageId(value) {
  if (value == null) return "";
  const s = String(value).trim();
  if (!s) return "";
  // Atlassian page ids are numeric; DC ids are also numeric. Allow the safe
  // subset [a-zA-Z0-9_.:-] to cover both, plus any future id format.
  if (!/^[a-zA-Z0-9_.:-]{1,64}$/.test(s)) return "";
  return s;
}

function sanitizeConfluenceUrl(value) {
  if (value == null) return "";
  const url = String(value).trim();
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
  } catch {
    return "";
  }
  return "";
}

export function normalizeScenario(s, options = {}) {
  if (!isScenarioRecord(s)) return null;
  const image_urls = sanitizeImageUrls(collectRawImageInputs(s), options);
  const out = {
    id: Number(s.id),
    category: s.category,
    title: s.title,
    scenario: s.scenario,
    solution: s.solution,
    tags: s.tags.map((t) => String(t)),
    image_urls,
    image_url: image_urls[0] || "",
    confluence_page_id: sanitizeConfluencePageId(s.confluence_page_id),
    confluence_page_url: sanitizeConfluenceUrl(s.confluence_page_url),
    confluence_page_title:
      typeof s.confluence_page_title === "string" ? s.confluence_page_title.slice(0, 240) : "",
  };
  if (typeof s.is_published === "boolean") {
    out.is_published = s.is_published;
  } else if (s.is_published === 0 || s.is_published === 1) {
    out.is_published = Boolean(s.is_published);
  }
  return out;
}

export function normalizeScenarioList(list, options = {}) {
  if (!Array.isArray(list)) return null;
  const normalized = list.map((s) => normalizeScenario(s, options)).filter(Boolean);
  return normalized.length ? normalized : null;
}

export { sanitizeImageUrl, sanitizeConfluencePageId, sanitizeConfluenceUrl };
