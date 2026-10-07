const RECENT_KEY = "qm_recent_scenarios";
const RECENT_MAX = 8;
const FAVORITES_KEY = "qm_favorite_scenarios";
const FAVORITES_MAX = 50;
const WIDE_LAYOUT_KEY = "qm_wide_layout";
const PROGRESS_KEY = "qm_checklist_progress";
const PROGRESS_MAX_SCENARIOS = 30;

function readIdList(key) {
  try {
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(list)) return [];
    return list.map((id) => Number(id)).filter((id) => Number.isFinite(id));
  } catch {
    return [];
  }
}

function writeValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function readRecentIds() {
  return readIdList(RECENT_KEY);
}

export function pushRecentId(id) {
  const num = Number(id);
  if (!Number.isFinite(num)) return;
  const next = [num, ...readRecentIds().filter((x) => x !== num)].slice(0, RECENT_MAX);
  writeValue(RECENT_KEY, JSON.stringify(next));
  return next;
}

export function readFavoriteIds() {
  return readIdList(FAVORITES_KEY);
}

export function toggleFavoriteId(id) {
  const num = Number(id);
  if (!Number.isFinite(num)) return readFavoriteIds();
  const current = readFavoriteIds();
  const next = current.includes(num)
    ? current.filter((x) => x !== num)
    : [num, ...current].slice(0, FAVORITES_MAX);
  writeValue(FAVORITES_KEY, JSON.stringify(next));
  return next;
}

export function readWideLayout() {
  try {
    return localStorage.getItem(WIDE_LAYOUT_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeWideLayout(value) {
  writeValue(WIDE_LAYOUT_KEY, value ? "1" : "0");
}

function readProgressStore() {
  try {
    const obj = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

export function readCheckedSteps(scenarioId) {
  const entry = readProgressStore()[String(scenarioId)];
  return entry && typeof entry.steps === "object" ? entry.steps : {};
}

export function writeCheckedSteps(scenarioId, steps) {
  const store = readProgressStore();
  const key = String(scenarioId);
  const hasChecked = Object.values(steps || {}).some(Boolean);
  if (!hasChecked) {
    delete store[key];
  } else {
    store[key] = { steps, updatedAt: Date.now() };
  }
  const trimmed = Object.fromEntries(
    Object.entries(store)
      .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
      .slice(0, PROGRESS_MAX_SCENARIOS)
  );
  writeValue(PROGRESS_KEY, JSON.stringify(trimmed));
}
