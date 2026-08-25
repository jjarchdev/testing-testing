import { sanitizeWpList } from "./categoryMap.mjs";

export const MAX_SCENARIO_IMAGES = 8;
export const SUPPORTED_SCENARIO_LOCALES = ["en", "de", "sq"];
export const VERDICT_CODES = ["to_be_rejected", "acceptable", "grey_area"];

export function parseVerdict(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return VERDICT_CODES.includes(s) ? s : undefined;
}

export function coerceSolutionAsChecklist(value) {
  return value === true || value === 1 || value === "true";
}
const TAG_MAX_LEN = 60;
const TITLE_MAX_LEN = 240;
const BODY_MAX_LEN = 20_000;

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
  if (s.translations != null && (typeof s.translations !== "object" || Array.isArray(s.translations))) {
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

export function isLocalUploadPath(value) {
  if (value == null) return false;
  return String(value).trim().startsWith("/uploads/");
}

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

const CAPTION_MAX_LEN = 200;

export function sanitizeImageCaptions(raw, validUrls) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const allowed = new Set(Array.isArray(validUrls) ? validUrls : []);
  for (const [url, caption] of Object.entries(raw)) {
    if (!allowed.has(url)) continue;
    if (typeof caption !== "string") continue;
    const trimmed = caption.trim().slice(0, CAPTION_MAX_LEN);
    if (trimmed) out[url] = trimmed;
  }
  return out;
}

function collectRawImageInputs(s) {
  if (Array.isArray(s?.image_urls) && s.image_urls.length) return s.image_urls;
  if (typeof s?.image_url === "string" && s.image_url.trim()) return [s.image_url];
  if (Array.isArray(s?.image_urls)) return [];
  return [];
}

function sanitizeConfluencePageId(value) {
  if (value == null) return "";
  const s = String(value).trim();
  if (!s) return "";
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

function sanitizeTags(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const t = raw.trim().slice(0, TAG_MAX_LEN);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 30) break;
  }
  return out;
}

export function sanitizeTranslation(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, TITLE_MAX_LEN) : "";
  const scenario =
    typeof raw.scenario === "string" ? raw.scenario.slice(0, BODY_MAX_LEN) : "";
  const solution =
    typeof raw.solution === "string" ? raw.solution.slice(0, BODY_MAX_LEN) : "";
  const acceptance =
    typeof raw.acceptance === "string" ? raw.acceptance.slice(0, BODY_MAX_LEN) : "";
  const tags = sanitizeTags(raw.tags);
  if (!title.trim() && !scenario.trim() && !solution.trim()) return null;
  return { title, scenario, solution, acceptance, tags };
}

export function sanitizeTranslations(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const lng of SUPPORTED_SCENARIO_LOCALES) {
    const slot = sanitizeTranslation(raw[lng]);
    if (slot) out[lng] = slot;
  }
  return out;
}

export function pickTranslation(scenario, preferred) {
  if (!scenario) return null;
  const t = scenario.translations || {};
  const hasAnyTranslation = SUPPORTED_SCENARIO_LOCALES.some((lng) => {
    const slot = t[lng];
    return slot && ((slot.title || "").trim() || (slot.scenario || "").trim() || (slot.solution || "").trim());
  });

  if (preferred) {
    const slot = t[preferred];
    if (slot && (slot.title || "").trim() && (slot.scenario || "").trim() && (slot.solution || "").trim()) {
      return { ...slot, acceptance: slot.acceptance || "", _language: preferred };
    }
  }

  if (!hasAnyTranslation) {
    const title = (scenario.title || "").trim();
    const sc = (scenario.scenario || "").trim();
    const sol = (scenario.solution || "").trim();
    if (!title || !sc || !sol) return null;
    const order = [preferred, ...SUPPORTED_SCENARIO_LOCALES].filter(
      (l, i, arr) => l && arr.indexOf(l) === i
    );
    let acceptance = "";
    for (const lng of order) {
      const text = (t[lng]?.acceptance || "").trim();
      if (text) {
        acceptance = t[lng].acceptance;
        break;
      }
    }
    return {
      title: scenario.title || "",
      scenario: scenario.scenario || "",
      solution: scenario.solution || "",
      acceptance,
      tags: Array.isArray(scenario.tags) ? scenario.tags : [],
      _language: null,
    };
  }

  return null;
}

export function normalizeScenario(s, options = {}) {
  if (!isScenarioRecord(s)) return null;
  const image_urls = sanitizeImageUrls(collectRawImageInputs(s), options);
  const translations = sanitizeTranslations(s.translations);
  const out = {
    id: Number(s.id),
    category: s.category,
    title: s.title,
    scenario: s.scenario,
    solution: s.solution,
    tags: s.tags.map((t) => String(t)),
    image_urls,
    image_url: image_urls[0] || "",
    image_captions: sanitizeImageCaptions(s.image_captions, image_urls),
    translations,
    confluence_page_id: sanitizeConfluencePageId(s.confluence_page_id),
    confluence_page_url: sanitizeConfluenceUrl(s.confluence_page_url),
    confluence_page_title:
      typeof s.confluence_page_title === "string" ? s.confluence_page_title.slice(0, 240) : "",
    solution_as_checklist: coerceSolutionAsChecklist(s.solution_as_checklist),
    acceptance_as_checklist: coerceSolutionAsChecklist(s.acceptance_as_checklist),
    verdict: parseVerdict(s.verdict) || null,
    category_wps: sanitizeWpList(s.category_wps ?? s.category_wp),
  };
  out.category_wp = out.category_wps.join(", ");
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
