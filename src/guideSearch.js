import { normalizeSearchText } from "./utils.js";

export function guideMatchesQuery(guide, rawQuery) {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;
  const parts = [guide.title, ...(guide.wps || [])];
  for (const slot of Object.values(guide.translations || {})) {
    parts.push(slot.title, slot.summary, ...(slot.tags || []));
  }
  for (const step of guide.steps || []) {
    for (const slot of Object.values(step.translations || {})) parts.push(slot.text);
  }
  const haystack = normalizeSearchText(parts.filter(Boolean).join(" "));
  return q.split(" ").filter(Boolean).every((token) => haystack.includes(token));
}
