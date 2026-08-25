const RECENT_KEY = "qm_recent_scenarios";
const RECENT_MAX = 8;

export function readRecentIds() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = JSON.parse(raw || "[]");
    if (!Array.isArray(list)) return [];
    return list.map((id) => Number(id)).filter((id) => Number.isFinite(id));
  } catch {
    return [];
  }
}

export function pushRecentId(id) {
  const num = Number(id);
  if (!Number.isFinite(num)) return;
  const next = [num, ...readRecentIds().filter((x) => x !== num)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

const FAVORITES_KEY = "qm_favorite_scenarios";
const FAVORITES_MAX = 50;

export function readFavoriteIds() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const list = JSON.parse(raw || "[]");
    if (!Array.isArray(list)) return [];
    return list.map((id) => Number(id)).filter((id) => Number.isFinite(id));
  } catch {
    return [];
  }
}

export function toggleFavoriteId(id) {
  const num = Number(id);
  if (!Number.isFinite(num)) return readFavoriteIds();
  const current = readFavoriteIds();
  const next = current.includes(num)
    ? current.filter((x) => x !== num)
    : [num, ...current].slice(0, FAVORITES_MAX);
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

const PROGRESS_KEY = "qm_checklist_progress";
const PROGRESS_MAX_SCENARIOS = 30;

function readProgressStore() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const obj = JSON.parse(raw || "{}");
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
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}
