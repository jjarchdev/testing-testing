import { createClient } from "@supabase/supabase-js";
import {
  normalizeCategory,
  normalizeWorkPackage,
  sanitizeWp,
  sanitizeWpList,
  slugifyLabel,
} from "../shared/categoryMap.mjs";
import {
  isScenarioV2Id,
  legacyFieldsFromSituationPayload,
  normalizeScenario,
  sanitizeImageUrls,
  withoutReplacedLegacy,
} from "../shared/scenarioSchema.mjs";

const MIGRATION_HINT =
  "The database is missing the new scenario tables. Run supabase/migrations/010_situations.sql and 011_scenarios_v2_replaces.sql in the Supabase SQL editor, then try again.";

function isMissingColumnError(error) {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return /column .* does not exist|could not find the '.*' column/i.test(String(error.message || ""));
}

function isMissingRelationError(error) {
  const code = String(error?.code || "");
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /could not find the table|relation .* does not exist/i.test(String(error?.message || ""))
  );
}

function throwMigrationHintIfNeeded(error) {
  if (isMissingRelationError(error) || isMissingColumnError(error)) {
    throw new Error(MIGRATION_HINT);
  }
  throw error;
}

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
      image_captions: row.image_captions && typeof row.image_captions === "object" ? row.image_captions : {},
      translations: row.translations && typeof row.translations === "object" ? row.translations : {},
      confluence_page_id:
        typeof row.confluence_page_id === "string" ? row.confluence_page_id : "",
      confluence_page_url:
        typeof row.confluence_page_url === "string" ? row.confluence_page_url : "",
      confluence_page_title:
        typeof row.confluence_page_title === "string" ? row.confluence_page_title : "",
      is_published: typeof row.is_published === "boolean" ? row.is_published : undefined,
      solution_as_checklist: row.solution_as_checklist === true,
      acceptance_as_checklist: row.acceptance_as_checklist === true,
      verdict: row.verdict ?? null,
      category_wps: row.category_wps ?? row.category_wp ?? [],
    },
    allowLocal
  );
}

function rowToCategory(row) {
  return normalizeCategory(row);
}

function rowToWorkPackage(row) {
  return normalizeWorkPackage(row);
}

async function loadWpsByCategorySlug() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("category_work_packages")
    .select("category_slug, work_packages(label, sort_order)");
  if (error) throw error;
  const by = Object.create(null);
  for (const row of data || []) {
    const label = row.work_packages?.label;
    if (!label) continue;
    if (!by[row.category_slug]) by[row.category_slug] = [];
    by[row.category_slug].push({
      label,
      sort: Number(row.work_packages?.sort_order) || 0,
    });
  }
  for (const slug of Object.keys(by)) {
    by[slug].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
    by[slug] = by[slug].map((x) => x.label);
  }
  return by;
}

async function attachCategoryWps(category) {
  if (!category) return null;
  const by = await loadWpsByCategorySlug();
  return { ...category, wps: by[category.slug] || [] };
}

async function attachCategoryWpsList(categories) {
  if (!categories.length) return categories;
  const by = await loadWpsByCategorySlug();
  return categories.map((c) => ({ ...c, wps: by[c.slug] || [] }));
}

export async function listWorkPackages() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("work_packages")
    .select("slug, label, sort_order")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToWorkPackage).filter(Boolean);
}

async function findWorkPackageBySlug(slug) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("work_packages")
    .select("slug, label, sort_order")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return rowToWorkPackage(data);
}

async function findWorkPackageByLabel(label) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("work_packages")
    .select("slug, label, sort_order")
    .eq("label", String(label || "").trim())
    .maybeSingle();
  if (error) throw error;
  return rowToWorkPackage(data);
}

async function nextWorkPackageSortOrder(sb) {
  const { data, error } = await sb
    .from("work_packages")
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

function mapWpDbError(error) {
  if (!error) return;
  const msg = String(error.message || "");
  const code = String(error.code || "");
  if (code === "23505" || /duplicate|unique/i.test(msg)) {
    throw new Error("WP label already exists");
  }
  throw error;
}

async function resolveWpSlugs(labelsOrSlugs) {
  const wanted = sanitizeWpList(labelsOrSlugs);
  if (!wanted.length) return [];
  const all = await listWorkPackages();
  const slugs = [];
  for (const w of wanted) {
    const found = all.find((p) => p.label === w || p.slug === w);
    if (!found) throw new Error(`Unknown WP: ${w}`);
    slugs.push(found.slug);
  }
  return slugs;
}

async function replaceCategoryWps(categorySlug, labelsOrSlugs) {
  const slugs = await resolveWpSlugs(labelsOrSlugs);
  const sb = getSupabase();
  const { error: delErr } = await sb
    .from("category_work_packages")
    .delete()
    .eq("category_slug", categorySlug);
  if (delErr) throw delErr;
  if (!slugs.length) return;
  const { error } = await sb.from("category_work_packages").insert(
    slugs.map((wp_slug) => ({ category_slug: categorySlug, wp_slug }))
  );
  if (error) throw error;
}

export async function insertWorkPackage(payload) {
  const sb = getSupabase();
  const label = sanitizeWp(payload?.label);
  if (!label) throw new Error("Label required");

  let slug =
    typeof payload?.slug === "string" && payload.slug.trim()
      ? slugifyLabel(payload.slug)
      : slugifyLabel(label);

  const existing = await findWorkPackageBySlug(slug);
  if (existing) {
    slug = `${slug}_${Date.now().toString(36)}`;
  }

  const sort_order =
    payload?.sort_order != null && Number.isFinite(Number(payload.sort_order))
      ? Number(payload.sort_order)
      : await nextWorkPackageSortOrder(sb);

  const { data, error } = await sb
    .from("work_packages")
    .insert({ slug, label, sort_order })
    .select("slug, label, sort_order")
    .single();
  if (error) mapWpDbError(error);
  return rowToWorkPackage(data);
}

export async function updateWorkPackage(slug, payload) {
  const sb = getSupabase();
  const current = await findWorkPackageBySlug(slug);
  if (!current) return null;

  const updates = {};
  if (typeof payload?.label === "string" && sanitizeWp(payload.label)) {
    updates.label = sanitizeWp(payload.label);
  }
  if (payload?.sort_order != null && Number.isFinite(Number(payload.sort_order))) {
    updates.sort_order = Number(payload.sort_order);
  }
  if (Object.keys(updates).length === 0) return current;

  if (updates.label && updates.label !== current.label) {
    const clash = await findWorkPackageByLabel(updates.label);
    if (clash && clash.slug !== slug) {
      throw new Error("WP label already exists");
    }
  }

  const { error } = await sb.from("work_packages").update(updates).eq("slug", slug);
  if (error) mapWpDbError(error);
  return findWorkPackageBySlug(slug);
}

export async function deleteWorkPackage(slug) {
  const sb = getSupabase();
  const current = await findWorkPackageBySlug(slug);
  if (!current) return { deleted: false, reason: "not_found" };

  const { count, error: countError } = await sb
    .from("category_work_packages")
    .select("category_slug", { count: "exact", head: true })
    .eq("wp_slug", slug);
  if (countError) throw countError;
  const { count: scenarioCount, error: scenarioCountError } = await sb
    .from(V2_WP_TABLE)
    .select("scenario_id", { count: "exact", head: true })
    .eq("wp_slug", slug);
  if (scenarioCountError && !isMissingRelationError(scenarioCountError)) throw scenarioCountError;
  const inUse = (count || 0) + (scenarioCountError ? 0 : scenarioCount || 0);
  if (inUse > 0) {
    return { deleted: false, reason: "in_use", count: inUse };
  }

  const { error } = await sb.from("work_packages").delete().eq("slug", slug);
  if (error) throw error;
  return { deleted: true };
}

export async function listCategories() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("categories")
    .select("slug, label, sort_order")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) throw error;
  const cats = (data || []).map(rowToCategory).filter(Boolean);
  return attachCategoryWpsList(cats);
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
  if (Object.prototype.hasOwnProperty.call(payload || {}, "wps") || payload?.wp) {
    await replaceCategoryWps(slug, payload.wps ?? payload.wp);
  }
  return attachCategoryWps(rowToCategory(data));
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
  const hasWps = Object.prototype.hasOwnProperty.call(payload || {}, "wps");
  if (Object.keys(updates).length === 0 && !hasWps) {
    return attachCategoryWps(current);
  }

  if (updates.label && updates.label !== current.label) {
    const clash = await findCategoryByLabel(updates.label);
    if (clash && clash.slug !== slug) {
      throw new Error("Category label already exists");
    }
  }

  if (Object.keys(updates).length) {
    const { error } = await sb.from("categories").update(updates).eq("slug", slug);
    if (error) mapCategoryDbError(error);
  }
  if (hasWps) {
    await replaceCategoryWps(slug, payload.wps);
  }
  return attachCategoryWps(await findCategoryBySlug(slug));
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

const V2_TABLE = "scenarios_v2";
const V2_WP_TABLE = "scenarios_v2_work_packages";

function rowToV2Scenario(row, wps) {
  return normalizeScenario(
    {
      id: Number(row.id),
      category: "",
      title: row.title,
      scenario: "",
      solution: "",
      tags: Array.isArray(row.tags) ? row.tags : [],
      translations: row.translations && typeof row.translations === "object" ? row.translations : {},
      wps,
      situations: Array.isArray(row.situations) ? row.situations : [],
      replaces_legacy_id: row.replaces_legacy_id,
      confluence_page_id: typeof row.confluence_page_id === "string" ? row.confluence_page_id : "",
      confluence_page_url: typeof row.confluence_page_url === "string" ? row.confluence_page_url : "",
      confluence_page_title: typeof row.confluence_page_title === "string" ? row.confluence_page_title : "",
      is_published: typeof row.is_published === "boolean" ? row.is_published : undefined,
    },
    { allowLocalUploads: false }
  );
}

async function loadV2WpLabels() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(V2_WP_TABLE)
    .select("scenario_id, work_packages(label, sort_order)");
  if (error) throw error;
  const by = Object.create(null);
  for (const row of data || []) {
    const label = row.work_packages?.label;
    if (!label) continue;
    if (!by[row.scenario_id]) by[row.scenario_id] = [];
    by[row.scenario_id].push({ label, sort: Number(row.work_packages?.sort_order) || 0 });
  }
  for (const id of Object.keys(by)) {
    by[id].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
    by[id] = by[id].map((x) => x.label);
  }
  return by;
}

async function listV2Scenarios({ publishedOnly }) {
  const sb = getSupabase();
  let query = sb
    .from(V2_TABLE)
    .select("*")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (publishedOnly) query = query.eq("is_published", true);
  const { data, error } = await query;
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  if (!data?.length) return [];
  const wpsById = await loadV2WpLabels();
  return data.map((row) => rowToV2Scenario(row, wpsById[row.id] || [])).filter(Boolean);
}

async function getV2ScenarioById(id) {
  const sb = getSupabase();
  const { data, error } = await sb.from(V2_TABLE).select("*").eq("id", id).maybeSingle();
  if (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
  if (!data) return null;
  const wpsById = await loadV2WpLabels();
  return rowToV2Scenario(data, wpsById[data.id] || []);
}

async function getLegacyScenarioById(id) {
  const sb = getSupabase();
  const { data, error } = await sb.from("scenarios_admin").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return rowToScenario(data);
}

async function getScenarioById(id) {
  return isScenarioV2Id(id) ? getV2ScenarioById(id) : getLegacyScenarioById(id);
}

export async function listPublishedScenarios() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("scenarios_employee")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  const legacy = (data || []).map(rowToScenario).filter(Boolean);
  return withoutReplacedLegacy([...legacy, ...(await listV2Scenarios({ publishedOnly: true }))], {
    publishedOnly: true,
  });
}

export async function listAllScenarios({ includeReplaced = false } = {}) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("scenarios_admin")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  const legacy = (data || []).map(rowToScenario).filter(Boolean);
  const all = [...legacy, ...(await listV2Scenarios({ publishedOnly: false }))];
  return includeReplaced ? all : withoutReplacedLegacy(all, { publishedOnly: false });
}

function v2Row(payload) {
  const translations = {};
  for (const [lng, slot] of Object.entries(payload.translations || {})) {
    translations[lng] = { title: slot.title, tags: slot.tags };
  }
  const row = {
    title: payload.title.trim(),
    tags: payload.tags,
    translations,
    situations: payload.situations,
  };
  if (payload.confluence_page_id) {
    row.confluence_page_id = payload.confluence_page_id;
    row.confluence_page_url = payload.confluence_page_url || null;
    row.confluence_page_title = payload.confluence_page_title || null;
  }
  return row;
}

async function replaceV2Wps(scenarioId, labelsOrSlugs) {
  const slugs = await resolveWpSlugs(labelsOrSlugs);
  const sb = getSupabase();
  const { error: delErr } = await sb.from(V2_WP_TABLE).delete().eq("scenario_id", scenarioId);
  if (delErr) throwMigrationHintIfNeeded(delErr);
  if (!slugs.length) return;
  const { error } = await sb
    .from(V2_WP_TABLE)
    .insert(slugs.map((wp_slug) => ({ scenario_id: scenarioId, wp_slug })));
  if (error) throwMigrationHintIfNeeded(error);
}

export async function insertScenario(payload) {
  const sb = getSupabase();
  await resolveWpSlugs(payload.wps);
  const row = { ...v2Row(payload), is_published: payload.is_published !== false };
  if (payload.replaces_legacy_id) {
    if (!(await getLegacyScenarioById(payload.replaces_legacy_id))) {
      throw new Error("The scenario to replace was not found");
    }
    row.replaces_legacy_id = payload.replaces_legacy_id;
  }
  const { data, error } = await sb.from(V2_TABLE).insert(row).select("id").single();
  if (error?.code === "23505") throw new Error("This scenario has already been converted");
  if (error) throwMigrationHintIfNeeded(error);
  try {
    await replaceV2Wps(data.id, payload.wps);
  } catch (e) {
    await sb.from(V2_TABLE).delete().eq("id", data.id);
    throw e;
  }
  return getV2ScenarioById(data.id);
}

async function updateV2Scenario(id, payload) {
  const sb = getSupabase();
  const previous = await getV2ScenarioById(id);
  if (!previous) return null;

  await resolveWpSlugs(payload.wps);
  const updates = { ...v2Row(payload), updated_at: new Date().toISOString() };
  if (typeof payload.is_published === "boolean") {
    updates.is_published = payload.is_published;
  }
  const { error } = await sb.from(V2_TABLE).update(updates).eq("id", id);
  if (error) throwMigrationHintIfNeeded(error);
  await replaceV2Wps(id, payload.wps);

  const saved = await getV2ScenarioById(id);
  const { removeStoredImages, urlsRemovedFromScenario, imageUrlsFromScenario } = await import(
    "./upload.js"
  );
  await removeStoredImages(urlsRemovedFromScenario(previous, imageUrlsFromScenario(saved)));
  return saved;
}

async function updateLegacyScenario(id, payload) {
  const sb = getSupabase();
  const previous = await getLegacyScenarioById(id);
  if (!previous) return null;

  const fields = legacyFieldsFromSituationPayload(payload);
  const image_urls = sanitizeImageUrls(fields.image_urls, { allowLocalUploads: false });
  const updates = {
    title: fields.title.trim(),
    situation: fields.scenario.trim(),
    solution: fields.solution.trim(),
    tags: fields.tags,
    translations: fields.translations,
    image_url: image_urls[0] || null,
    image_urls,
    confluence_page_id: payload.confluence_page_id || null,
    confluence_page_url: payload.confluence_page_url || null,
    confluence_page_title: payload.confluence_page_title || null,
    solution_as_checklist: fields.solution_as_checklist,
    acceptance_as_checklist: fields.acceptance_as_checklist,
    verdict: fields.verdict,
  };
  if (typeof payload.is_published === "boolean") {
    updates.is_published = payload.is_published;
  }
  let { error } = await sb
    .from("scenarios")
    .update({ ...updates, image_captions: fields.image_captions })
    .eq("id", id);
  if (error && isMissingColumnError(error)) {
    ({ error } = await sb.from("scenarios").update(updates).eq("id", id));
  }
  if (error) throw error;

  const { removeStoredImages, urlsRemovedFromScenario } = await import("./upload.js");
  await removeStoredImages(urlsRemovedFromScenario(previous, image_urls));
  return getLegacyScenarioById(id);
}

export async function updateScenario(id, payload) {
  return isScenarioV2Id(id) ? updateV2Scenario(id, payload) : updateLegacyScenario(id, payload);
}

export async function deleteScenarioById(id) {
  const sb = getSupabase();
  const previous = await getScenarioById(id);
  const { error } = isScenarioV2Id(id)
    ? await sb.from(V2_TABLE).delete().eq("id", id)
    : await sb.from("scenarios").delete().eq("id", id);
  if (error) throw error;
  if (previous) {
    const { removeStoredImages, imageUrlsFromScenario } = await import("./upload.js");
    await removeStoredImages(imageUrlsFromScenario(previous));
  }
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
  if ((count || 0) > 0) return true;
  const { count: v2Count, error: v2Error } = await sb
    .from(V2_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("confluence_page_id", clean)
    .eq("is_published", true);
  if (v2Error) {
    if (isMissingRelationError(v2Error) || isMissingColumnError(v2Error)) return false;
    throw v2Error;
  }
  return (v2Count || 0) > 0;
}
