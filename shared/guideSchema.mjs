import { sanitizeWpList } from "./categoryMap.mjs";
import { SUPPORTED_SCENARIO_LOCALES, sanitizeImageUrl, sanitizeTags } from "./scenarioSchema.mjs";

export const MAX_GUIDE_STEPS = 40;
const TITLE_MAX_LEN = 160;
const SUMMARY_MAX_LEN = 600;
const STEP_TEXT_MAX_LEN = 2000;

export function sanitizeGuideTranslations(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const lng of SUPPORTED_SCENARIO_LOCALES) {
    const slot = raw[lng];
    if (!slot || typeof slot !== "object") continue;
    const title = typeof slot.title === "string" ? slot.title.trim().slice(0, TITLE_MAX_LEN) : "";
    const summary = typeof slot.summary === "string" ? slot.summary.trim().slice(0, SUMMARY_MAX_LEN) : "";
    const tags = sanitizeTags(slot.tags);
    if (!title && !summary && !tags.length) continue;
    out[lng] = { title, summary, tags };
  }
  return out;
}

export function sanitizeGuideSteps(raw, options = {}) {
  if (!Array.isArray(raw)) return [];
  const usedIds = new Set();
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const image_url = sanitizeImageUrl(item.image_url, options);
    const translations = {};
    for (const lng of SUPPORTED_SCENARIO_LOCALES) {
      const text = item.translations?.[lng]?.text;
      if (typeof text === "string" && text.trim()) {
        translations[lng] = { text: text.slice(0, STEP_TEXT_MAX_LEN) };
      }
    }
    if (!image_url && !Object.keys(translations).length) continue;
    let id =
      typeof item.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(item.id) ? item.id : `g${out.length + 1}`;
    while (usedIds.has(id)) id = `${id}x`.slice(0, 40);
    usedIds.add(id);
    out.push({ id, image_url, translations });
    if (out.length >= MAX_GUIDE_STEPS) break;
  }
  return out;
}

function firstTitle(translations) {
  for (const lng of SUPPORTED_SCENARIO_LOCALES) {
    const title = (translations[lng]?.title || "").trim();
    if (title) return title;
  }
  return "";
}

export function normalizeGuide(raw, options = {}) {
  if (!raw || typeof raw !== "object") return null;
  const id = Number(raw.id);
  if (!Number.isFinite(id) || id < 1) return null;
  const translations = sanitizeGuideTranslations(raw.translations);
  const sortOrder = Number(raw.sort_order);
  return {
    id,
    title: firstTitle(translations) || (typeof raw.title === "string" ? raw.title.trim().slice(0, TITLE_MAX_LEN) : ""),
    translations,
    steps: sanitizeGuideSteps(raw.steps, options),
    wps: sanitizeWpList(raw.wps),
    is_published: typeof raw.is_published === "boolean" ? raw.is_published : true,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    created_at: typeof raw.created_at === "string" ? raw.created_at : null,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : null,
  };
}

export function guideImageUrlList(guide) {
  const urls = [];
  for (const step of guide?.steps || []) {
    if (step.image_url && !urls.includes(step.image_url)) urls.push(step.image_url);
  }
  return urls;
}

export function guideCoverUrl(guide) {
  return (guide?.steps || []).find((s) => s.image_url)?.image_url || "";
}

export function pickGuideView(guide, preferred) {
  if (!guide || !Array.isArray(guide.steps) || !guide.steps.length) return null;
  const order = [preferred, ...SUPPORTED_SCENARIO_LOCALES].filter((l, i, arr) => l && arr.indexOf(l) === i);
  const lng = order.find((l) => (guide.translations?.[l]?.title || "").trim());
  if (!lng) return null;
  const slot = guide.translations[lng];
  const steps = guide.steps.map((step) => {
    const captionLng = order.find((l) => (step.translations?.[l]?.text || "").trim());
    return {
      id: step.id,
      image_url: step.image_url || "",
      text: captionLng ? step.translations[captionLng].text : "",
    };
  });
  return {
    id: guide.id,
    title: slot.title,
    summary: slot.summary || "",
    tags: Array.isArray(slot.tags) ? slot.tags : [],
    language: lng,
    fallback: lng !== preferred,
    steps,
  };
}
