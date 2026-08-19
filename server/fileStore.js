import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  normalizeCategory,
  normalizeWorkPackage,
  sanitizeWpList,
  slugifyLabel,
} from "../shared/categoryMap.mjs";
import { normalizeScenario } from "../shared/scenarioSchema.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_FILE = process.env.SCENARIOS_DATA_PATH || path.join(ROOT, "data", "scenarios.json");
const STORAGE_VERSION = 3;

async function readRaw() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeRaw(payload) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(tmp, DATA_FILE);
}

function defaultPayload() {
  return {
    v: STORAGE_VERSION,
    categories: [],
    workPackages: [],
    scenarios: [],
  };
}

async function ensureDataFile() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  if (!existsSync(DATA_FILE)) {
    await fs.writeFile(DATA_FILE, JSON.stringify(defaultPayload(), null, 2), "utf8");
  }
}

function parseScenarioList(rawList) {
  if (!Array.isArray(rawList)) return null;
  const normalized = rawList.map(normalizeScenario).filter(Boolean);
  if (normalized.length !== rawList.length) return null;
  return normalized;
}

function parseCategoryList(rawList) {
  if (!Array.isArray(rawList)) return null;
  const normalized = rawList.map(normalizeCategory).filter(Boolean);
  if (normalized.length !== rawList.length) return null;
  return normalized;
}

function parseWorkPackageList(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList.map(normalizeWorkPackage).filter(Boolean);
}

function collectWorkPackages(categories, existing) {
  const byLabel = new Map();
  for (const w of existing || []) {
    const n = normalizeWorkPackage(w);
    if (n) byLabel.set(n.label, n);
  }
  for (const c of categories) {
    for (const label of c.wps || []) {
      if (byLabel.has(label)) continue;
      let slug;
      try {
        slug = slugifyLabel(label);
      } catch {
        continue;
      }
      if ([...byLabel.values()].some((p) => p.slug === slug)) {
        slug = `${slug}_${Date.now().toString(36)}`;
      }
      byLabel.set(label, {
        slug,
        label,
        sort_order: byLabel.size + 1,
      });
    }
  }
  return [...byLabel.values()].sort(
    (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)
  );
}

function withCategoryWps(scenarios, categories) {
  const byLabel = Object.create(null);
  for (const c of categories) {
    if (c?.label) byLabel[c.label] = c.wps || [];
  }
  return scenarios
    .map((s) => normalizeScenario({ ...s, category_wps: byLabel[s.category] || [] }))
    .filter(Boolean);
}

async function loadStore() {
  const data = await readRaw();
  if (!data) return null;

  if (Array.isArray(data)) {
    const scenarios = parseScenarioList(data);
    if (!scenarios) return null;
    const labels = [...new Set(scenarios.map((s) => s.category))];
    const categories = labels.map((label, i) =>
      normalizeCategory({
        slug: slugifyLabel(label),
        label,
        sort_order: i + 1,
        wps: [],
      })
    );
    return {
      categories,
      workPackages: [],
      scenarios: withCategoryWps(scenarios, categories),
    };
  }

  const scenarios = parseScenarioList(
    Array.isArray(data.scenarios) ? data.scenarios : []
  );
  if (!scenarios) return null;

  let categories = parseCategoryList(
    Array.isArray(data.categories) ? data.categories : []
  );
  if (!categories) {
    if (data.categories != null && !Array.isArray(data.categories)) return null;
    const labels = [...new Set(scenarios.map((s) => s.category))];
    categories = labels.map((label, i) =>
      normalizeCategory({
        slug: slugifyLabel(label),
        label,
        sort_order: i + 1,
        wps: [],
      })
    );
  }

  const workPackages = collectWorkPackages(
    categories,
    parseWorkPackageList(data.workPackages)
  );

  return {
    categories,
    workPackages,
    scenarios: withCategoryWps(scenarios, categories),
  };
}

async function persistStore({ categories, workPackages, scenarios }) {
  if (!Array.isArray(categories) || !Array.isArray(scenarios)) {
    throw new Error("Invalid store data");
  }
  const normalizedCategories = categories.map((c) => normalizeCategory(c)).filter(Boolean);
  if (normalizedCategories.length !== categories.length) {
    throw new Error("Invalid categories");
  }
  const normalizedWps = collectWorkPackages(normalizedCategories, workPackages || []);
  const normalizedScenarios = withCategoryWps(scenarios, normalizedCategories);
  if (normalizedScenarios.length !== scenarios.length) {
    throw new Error("Invalid scenarios");
  }
  await writeRaw({
    v: STORAGE_VERSION,
    categories: normalizedCategories,
    workPackages: normalizedWps,
    scenarios: normalizedScenarios,
  });
  return {
    categories: normalizedCategories,
    workPackages: normalizedWps,
    scenarios: normalizedScenarios,
  };
}

export async function readScenariosFromDisk() {
  const store = await loadStore();
  return store?.scenarios ?? null;
}

export async function writeScenariosToDisk(scenarios) {
  const store = await loadStore();
  if (!store) throw new Error("Invalid scenarios file");
  const result = await persistStore({
    categories: store.categories,
    workPackages: store.workPackages,
    scenarios,
  });
  return result.scenarios;
}

export async function readCategoriesFromDisk() {
  const store = await loadStore();
  return store?.categories ?? null;
}

export async function writeCategoriesToDisk(categories) {
  const store = await loadStore();
  if (!store) throw new Error("Invalid scenarios file");
  const result = await persistStore({
    categories,
    workPackages: store.workPackages,
    scenarios: store.scenarios,
  });
  return result.categories;
}

export async function readWorkPackagesFromDisk() {
  const store = await loadStore();
  return store?.workPackages ?? null;
}

function resolveWpsAgainstStore(store, labelsOrSlugs) {
  const wanted = sanitizeWpList(labelsOrSlugs);
  const out = [];
  for (const w of wanted) {
    const found = store.workPackages.find((p) => p.label === w || p.slug === w);
    if (!found) throw new Error(`Unknown WP: ${w}`);
    out.push(found.label);
  }
  return out;
}

export async function insertCategoryOnDisk(payload) {
  const store = await loadStore();
  if (!store) throw new Error("Read failed");

  const label = String(payload?.label || "").trim();
  if (!label) throw new Error("Label required");
  if (store.categories.some((c) => c.label === label)) {
    throw new Error("Category label already exists");
  }

  let slug =
    typeof payload?.slug === "string" && payload.slug.trim()
      ? slugifyLabel(payload.slug)
      : slugifyLabel(label);
  if (store.categories.some((c) => c.slug === slug)) {
    slug = `${slug}_${Date.now().toString(36)}`;
  }

  const sort_order =
    payload?.sort_order != null && Number.isFinite(Number(payload.sort_order))
      ? Number(payload.sort_order)
      : store.categories.reduce((max, c) => Math.max(max, c.sort_order), 0) + 1;

  const wps = Object.prototype.hasOwnProperty.call(payload || {}, "wps")
    ? resolveWpsAgainstStore(store, payload.wps)
    : [];
  const category = { slug, label, sort_order, wps };
  const result = await persistStore({
    categories: [...store.categories, category].sort(
      (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)
    ),
    workPackages: store.workPackages,
    scenarios: store.scenarios,
  });
  return result.categories.find((c) => c.slug === slug) || category;
}

export async function updateCategoryOnDisk(slug, payload) {
  const store = await loadStore();
  if (!store) throw new Error("Read failed");
  const idx = store.categories.findIndex((c) => c.slug === slug);
  if (idx < 0) return null;

  const current = store.categories[idx];
  const nextLabel =
    typeof payload?.label === "string" && payload.label.trim()
      ? payload.label.trim()
      : current.label;
  if (store.categories.some((c) => c.slug !== slug && c.label === nextLabel)) {
    throw new Error("Category label already exists");
  }

  const sort_order =
    payload?.sort_order != null && Number.isFinite(Number(payload.sort_order))
      ? Number(payload.sort_order)
      : current.sort_order;

  const wps = Object.prototype.hasOwnProperty.call(payload || {}, "wps")
    ? resolveWpsAgainstStore(store, payload.wps)
    : current.wps || [];
  const updated = { ...current, label: nextLabel, sort_order, wps };
  const categories = store.categories.map((c) => (c.slug === slug ? updated : c));

  const scenarios =
    nextLabel === current.label
      ? store.scenarios
      : store.scenarios.map((s) =>
          s.category === current.label ? { ...s, category: nextLabel } : s
        );

  const result = await persistStore({
    categories,
    workPackages: store.workPackages,
    scenarios,
  });
  return result.categories.find((c) => c.slug === slug) || updated;
}

export async function deleteCategoryOnDisk(slug) {
  const store = await loadStore();
  if (!store) throw new Error("Read failed");
  const cat = store.categories.find((c) => c.slug === slug);
  if (!cat) return { deleted: false, reason: "not_found" };

  const inUse = store.scenarios.filter((s) => s.category === cat.label).length;
  if (inUse > 0) {
    return { deleted: false, reason: "in_use", count: inUse };
  }

  await persistStore({
    categories: store.categories.filter((c) => c.slug !== slug),
    workPackages: store.workPackages,
    scenarios: store.scenarios,
  });
  return { deleted: true };
}

export async function insertWorkPackageOnDisk(payload) {
  const store = await loadStore();
  if (!store) throw new Error("Read failed");
  const label = String(payload?.label || "").trim().slice(0, 32);
  if (!label) throw new Error("Label required");
  if (store.workPackages.some((w) => w.label === label)) {
    throw new Error("WP label already exists");
  }
  let slug =
    typeof payload?.slug === "string" && payload.slug.trim()
      ? slugifyLabel(payload.slug)
      : slugifyLabel(label);
  if (store.workPackages.some((w) => w.slug === slug)) {
    slug = `${slug}_${Date.now().toString(36)}`;
  }
  const sort_order =
    payload?.sort_order != null && Number.isFinite(Number(payload.sort_order))
      ? Number(payload.sort_order)
      : store.workPackages.reduce((max, w) => Math.max(max, w.sort_order), 0) + 1;
  const wp = { slug, label, sort_order };
  const result = await persistStore({
    categories: store.categories,
    workPackages: [...store.workPackages, wp].sort(
      (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)
    ),
    scenarios: store.scenarios,
  });
  return result.workPackages.find((w) => w.slug === slug) || wp;
}

export async function updateWorkPackageOnDisk(slug, payload) {
  const store = await loadStore();
  if (!store) throw new Error("Read failed");
  const current = store.workPackages.find((w) => w.slug === slug);
  if (!current) return null;
  const nextLabel =
    typeof payload?.label === "string" && payload.label.trim()
      ? payload.label.trim().slice(0, 32)
      : current.label;
  if (store.workPackages.some((w) => w.slug !== slug && w.label === nextLabel)) {
    throw new Error("WP label already exists");
  }
  const sort_order =
    payload?.sort_order != null && Number.isFinite(Number(payload.sort_order))
      ? Number(payload.sort_order)
      : current.sort_order;
  const updated = { ...current, label: nextLabel, sort_order };
  const workPackages = store.workPackages.map((w) => (w.slug === slug ? updated : w));
  const categories =
    nextLabel === current.label
      ? store.categories
      : store.categories.map((c) => ({
          ...c,
          wps: (c.wps || []).map((l) => (l === current.label ? nextLabel : l)),
        }));
  const result = await persistStore({
    categories,
    workPackages,
    scenarios: store.scenarios,
  });
  return result.workPackages.find((w) => w.slug === slug) || updated;
}

export async function deleteWorkPackageOnDisk(slug) {
  const store = await loadStore();
  if (!store) throw new Error("Read failed");
  const wp = store.workPackages.find((w) => w.slug === slug);
  if (!wp) return { deleted: false, reason: "not_found" };
  const count = store.categories.filter((c) => (c.wps || []).includes(wp.label)).length;
  if (count > 0) {
    return { deleted: false, reason: "in_use", count };
  }
  await persistStore({
    categories: store.categories,
    workPackages: store.workPackages.filter((w) => w.slug !== slug),
    scenarios: store.scenarios,
  });
  return { deleted: true };
}

export function resolveCategoryLabelOnDisk(categories, labelOrSlug) {
  const value = String(labelOrSlug || "").trim();
  const byLabel = categories.find((c) => c.label === value);
  if (byLabel) return byLabel.label;
  const bySlug = categories.find((c) => c.slug === value);
  if (bySlug) return bySlug.label;
  throw new Error(`Unknown category: ${value}`);
}

export function withPublishedDefault(scenario, isPublished = true) {
  const normalized = normalizeScenario({
    ...scenario,
    is_published:
      typeof scenario.is_published === "boolean" ? scenario.is_published : isPublished,
  });
  return normalized;
}
