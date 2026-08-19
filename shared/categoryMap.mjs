export function slugifyLabel(label) {
  const raw = String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (!raw) throw new Error("Invalid category label");
  return raw.slice(0, 64);
}

export function labelToSlug(label) {
  return slugifyLabel(label);
}

const WP_MAX_LEN = 32;

export function sanitizeWp(value) {
  if (value == null) return "";
  return String(value).trim().slice(0, WP_MAX_LEN);
}

export function sanitizeWpList(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string" && value.trim()
      ? value.split(/[,;]/)
      : [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const w = sanitizeWp(item);
    if (!w || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

export function normalizeWorkPackage(row) {
  if (!row || typeof row !== "object") return null;
  const slug = typeof row.slug === "string" ? row.slug.trim() : "";
  const label = sanitizeWp(row.label);
  if (!slug || !label) return null;
  const sort_order = Number(row.sort_order);
  return {
    slug,
    label,
    sort_order: Number.isFinite(sort_order) ? sort_order : 0,
  };
}

export function normalizeWorkPackageList(list) {
  if (!Array.isArray(list)) return null;
  return list.map(normalizeWorkPackage).filter(Boolean);
}

export function normalizeCategory(row) {
  if (!row || typeof row !== "object") return null;
  const slug = typeof row.slug === "string" ? row.slug.trim() : "";
  const label = typeof row.label === "string" ? row.label.trim() : "";
  if (!slug || !label) return null;
  const sort_order = Number(row.sort_order);
  let wps = sanitizeWpList(row.wps);
  if (!wps.length) wps = sanitizeWpList(row.wp);
  return {
    slug,
    label,
    sort_order: Number.isFinite(sort_order) ? sort_order : 0,
    wps,
  };
}

export function normalizeCategoryList(list) {
  if (!Array.isArray(list)) return null;
  return list.map(normalizeCategory).filter(Boolean);
}
