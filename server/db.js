import { createClient } from "@supabase/supabase-js";
import { normalizeCategory, slugifyLabel } from "../shared/categoryMap.mjs";
import {
  normalizeScenario,
  sanitizeImageUrls,
  sanitizeTranslations,
  SUPPORTED_SCENARIO_LOCALES,
} from "../shared/scenarioSchema.mjs";

function supabaseUrl() {
  return (process.env.SUPABASE_URL || "").trim();
}

function supabaseSecretKey() {
  return (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  ).trim();
}

export function isSupabaseConfigured() {
  return supabaseUrl().length > 0 && supabaseSecretKey().length > 0;
}

export async function checkImageUrlsReady() {
  if (!isSupabaseConfigured()) return true;
  try {
    const sb = getSupabase();
    const { error } = await sb.from("scenarios").select("image_urls").limit(1);
    if (!error) return true;
    const msg = String(error.message || "");
    if (/image_urls|column|42703/i.test(msg)) return false;
    console.warn("[db] image_urls probe:", msg);
    return true;
  } catch (e) {
    console.warn("[db] image_urls probe failed:", e?.message || e);
    return true;
  }
}

export function usingLegacySupabaseKeyEnv() {
  return (
    !(process.env.SUPABASE_SECRET_KEY || "").trim() &&
    !!(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  );
}

let client = null;

export function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(supabaseUrl(), supabaseSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export function rowToScenario(row) {
  if (!row) return null;
  const allowLocal = { allowLocalUploads: false };
  const fromArray = Array.isArray(row.image_urls) ? row.image_urls : [];
  const legacy =
    typeof row.image_url === "string" && row.image_url.trim() ? [row.image_url] : [];
  const image_urls = sanitizeImageUrls(
    fromArray.length ? fromArray : legacy,
    allowLocal
  );
  return normalizeScenario(
    {
      id: Number(row.id),
      category: row.category,
      title: row.title,
      scenario: row.scenario,
      solution: row.solution,
      tags: Array.isArray(row.tags) ? row.tags : [],
      image_urls,
      image_url: image_urls[0] || "",
      translations: row.translations && typeof row.translations === "object" ? row.translations : {},
      confluence_page_id:
        typeof row.confluence_page_id === "string" ? row.confluence_page_id : "",
      confluence_page_url:
        typeof row.confluence_page_url === "string" ? row.confluence_page_url : "",
      confluence_page_title:
        typeof row.confluence_page_title === "string" ? row.confluence_page_title : "",
      is_published: typeof row.is_published === "boolean" ? row.is_published : undefined,
    },
    allowLocal
  );
}

function derivePrimaryFields(payload, translations) {
  const preferred = typeof payload?.primary_language === "string"
    ? payload.primary_language
    : null;
  const order = [preferred, "en", "de", "sq"].filter(
    (l, i, arr) => l && SUPPORTED_SCENARIO_LOCALES.includes(l) && arr.indexOf(l) === i
  );
  for (const lng of order) {
    const slot = translations[lng];
    if (slot && (slot.title || "").trim() && (slot.scenario || "").trim() && (slot.solution || "").trim()) {
      return {
        title: slot.title,
        scenario: slot.scenario,
        solution: slot.solution,
        tags: slot.tags,
      };
    }
  }
  return {
    title: (payload?.title || "").toString(),
    scenario: (payload?.scenario || "").toString(),
    solution: (payload?.solution || "").toString(),
    tags: Array.isArray(payload?.tags) ? payload.tags : [],
  };
}

function scenarioImageFields(payload) {
  const fromArray = Array.isArray(payload?.image_urls) ? payload.image_urls : null;
  const legacy =
    typeof payload?.image_url === "string" && payload.image_url.trim()
      ? payload.image_url.trim()
      : "";
  const raw =
    fromArray && fromArray.length > 0
      ? fromArray
      : legacy
        ? [legacy]
        : fromArray || [];
  const image_urls = sanitizeImageUrls(raw, { allowLocalUploads: false });
  return {
    image_urls,
    image_url: image_urls[0] || null,
  };
}

function rowToCategory(row) {
  return normalizeCategory(row);
}

export async function listCategories() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("categories")
    .select("slug, label, sort_order")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToCategory).filter(Boolean);
}

async function findCategoryByLabel(label) {
  const sb = getSupabase();
  const trimmed = String(label || "").trim();
  const { data, error } = await sb
    .from("categories")
    .select("slug, label, sort_order")
    .eq("label", trimmed)
    .maybeSingle();
  if (error) throw error;
  return rowToCategory(data);
}

async function findCategoryBySlug(slug) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("categories")
    .select("slug, label, sort_order")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return rowToCategory(data);
}

async function resolveCategorySlug(labelOrSlug) {
  const value = String(labelOrSlug || "").trim();
  if (!value) throw new Error("Category required");

  const byLabel = await findCategoryByLabel(value);
  if (byLabel) return byLabel.slug;

  const bySlug = await findCategoryBySlug(value);
  if (bySlug) return bySlug.slug;

  throw new Error(`Unknown category: ${value}`);
}

function mapCategoryDbError(error) {
  if (!error) return;
  const msg = String(error.message || "");
  const code = String(error.code || "");
  if (code === "23505" || /duplicate|unique/i.test(msg)) {
    throw new Error("Category label already exists");
  }
  throw error;
}

async function nextCategorySortOrder(sb) {
  const { data, error } = await sb
    .from("categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const max =
    data?.sort_order != null && Number.isFinite(Number(data.sort_order))
      ? Number(data.sort_order)
      : 0;
  return max + 1;
}

export async function insertCategory(payload) {
  const sb = getSupabase();
  const label = String(payload?.label || "").trim();
  if (!label) throw new Error("Label required");

  let slug = typeof payload?.slug === "string" && payload.slug.trim()
    ? slugifyLabel(payload.slug)
    : slugifyLabel(label);

  const existing = await findCategoryBySlug(slug);
  if (existing) {
    slug = `${slug}_${Date.now().toString(36)}`;
  }

  const sort_order =
    payload?.sort_order != null && Number.isFinite(Number(payload.sort_order))
      ? Number(payload.sort_order)
      : await nextCategorySortOrder(sb);

  const { data, error } = await sb
    .from("categories")
    .insert({ slug, label, sort_order })
    .select("slug, label, sort_order")
    .single();
  if (error) mapCategoryDbError(error);
  return rowToCategory(data);
}

export async function updateCategory(slug, payload) {
  const sb = getSupabase();
  const current = await findCategoryBySlug(slug);
  if (!current) return null;

  const updates = {};
  if (typeof payload?.label === "string" && payload.label.trim()) {
    updates.label = payload.label.trim();
  }
  if (payload?.sort_order != null && Number.isFinite(Number(payload.sort_order))) {
    updates.sort_order = Number(payload.sort_order);
  }
  if (Object.keys(updates).length === 0) return current;

  if (updates.label && updates.label !== current.label) {
    const clash = await findCategoryByLabel(updates.label);
    if (clash && clash.slug !== slug) {
      throw new Error("Category label already exists");
    }
  }

  const { error } = await sb.from("categories").update(updates).eq("slug", slug);
  if (error) mapCategoryDbError(error);
  return findCategoryBySlug(slug);
}

export async function deleteCategory(slug) {
  const sb = getSupabase();
  const current = await findCategoryBySlug(slug);
  if (!current) return { deleted: false, reason: "not_found" };

  const { count, error: countError } = await sb
    .from("scenarios")
    .select("id", { count: "exact", head: true })
    .eq("category_slug", slug);
  if (countError) throw countError;
  if ((count || 0) > 0) {
    return { deleted: false, reason: "in_use", count };
  }

  const { error } = await sb.from("categories").delete().eq("slug", slug);
  if (error) throw error;
  return { deleted: true };
}

export async function listPublishedScenarios() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("scenarios_employee")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToScenario).filter(Boolean);
}

export async function listAllScenarios() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("scenarios_admin")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToScenario).filter(Boolean);
}

export async function insertScenario(payload) {
  const sb = getSupabase();
  const category_slug = await resolveCategorySlug(payload.category);
  const images = scenarioImageFields(payload);
  const translations = sanitizeTranslations(payload.translations);
  const primary = derivePrimaryFields(payload, translations);
  const { data, error } = await sb
    .from("scenarios")
    .insert({
      category_slug,
      title: primary.title.trim(),
      situation: primary.scenario.trim(),
      solution: primary.solution.trim(),
      tags: primary.tags,
      translations,
      image_url: images.image_url,
      image_urls: images.image_urls,
      confluence_page_id: payload.confluence_page_id || null,
      confluence_page_url: payload.confluence_page_url || null,
      confluence_page_title: payload.confluence_page_title || null,
      sort_order: payload.sort_order ?? 0,
      is_published: payload.is_published !== false,
    })
    .select("id")
    .single();
  if (error) throw error;
  return getScenarioById(data.id);
}

export async function updateScenario(id, payload) {
  const sb = getSupabase();
  const previous = await getScenarioById(id);
  if (!previous) return null;

  const category_slug = await resolveCategorySlug(payload.category);
  const images = scenarioImageFields(payload);
  const translations = sanitizeTranslations(payload.translations);
  const primary = derivePrimaryFields(payload, translations);
  const updates = {
    category_slug,
    title: primary.title.trim(),
    situation: primary.scenario.trim(),
    solution: primary.solution.trim(),
    tags: primary.tags,
    translations,
    image_url: images.image_url,
    image_urls: images.image_urls,
    confluence_page_id: payload.confluence_page_id || null,
    confluence_page_url: payload.confluence_page_url || null,
    confluence_page_title: payload.confluence_page_title || null,
    sort_order: payload.sort_order ?? 0,
  };
  if (typeof payload.is_published === "boolean") {
    updates.is_published = payload.is_published;
  }
  const { error } = await sb.from("scenarios").update(updates).eq("id", id);
  if (error) throw error;

  const { removeStoredImages, urlsRemovedFromScenario } = await import("./upload.js");
  await removeStoredImages(urlsRemovedFromScenario(previous, images.image_urls));

  return getScenarioById(id);
}

export async function deleteScenarioById(id) {
  const sb = getSupabase();
  const previous = await getScenarioById(id);
  const { error } = await sb.from("scenarios").delete().eq("id", id);
  if (error) throw error;
  if (previous) {
    const { removeStoredImages, imageUrlsFromScenario } = await import("./upload.js");
    await removeStoredImages(imageUrlsFromScenario(previous));
  }
}

async function getScenarioById(id) {
  const sb = getSupabase();
  const { data, error } = await sb.from("scenarios_admin").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return rowToScenario(data);
}

export async function isConfluencePagePublic(pageId) {
  const clean = String(pageId || "").trim();
  if (!clean) return false;
  const sb = getSupabase();
  const { count, error } = await sb
    .from("scenarios")
    .select("id", { count: "exact", head: true })
    .eq("confluence_page_id", clean)
    .eq("is_published", true);
  if (error) throw error;
  return (count || 0) > 0;
}
