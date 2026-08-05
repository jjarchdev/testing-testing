function apiBase() {
  return String(import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");
}

export function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${apiBase()}${p}`;
}

export function apiFetch(path, options = {}) {
  return fetch(apiUrl(path), {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

export function apiFetchWithAuth(path, options = {}) {
  return apiFetch(path, options);
}

export async function fetchAdminSession() {
  const res = await apiFetch("/api/auth/me");
  if (!res.ok) return { admin: false, email: null };
  const data = await res.json().catch(() => ({}));
  return {
    admin: data?.admin === true,
    email: data?.email || null,
  };
}

export async function loginWithEnvCredentials({ username, password }) {
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: username || "",
      password: password || "",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `Login failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function logoutAdmin() {
  try {
    const mod = await import("./supabase.js");
    const client = await mod.getSupabaseAuth();
    if (client) await client.auth.signOut().catch(() => {});
  } catch {
    /* ignore */
  }
  await apiFetch("/api/auth/logout", { method: "POST" });
}

export async function uploadImageFile(file) {
  const body = new FormData();
  body.append("file", file);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let res;
  try {
    res = await fetch(apiUrl("/api/uploads/image"), {
      method: "POST",
      credentials: "include",
      body,
      signal: controller.signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error("Upload timed out. Try a smaller image or check Storage bucket setup.");
    }
    throw new Error("Upload failed (network). Is the API running?");
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    throw new Error("Sign in again, then retry the upload.");
  }
  if (!res.ok) {
    throw new Error(data?.error || `Upload failed (${res.status})`);
  }
  if (!data?.url) throw new Error("Bad upload response");
  return data.url;
}

async function jsonOrThrow(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function fetchConfluenceStatus() {
  const res = await apiFetch("/api/confluence/status");
  return jsonOrThrow(res);
}

export async function startConfluenceCloudConnect() {
  const res = await apiFetchWithAuth("/api/confluence/connect/cloud");
  const data = await jsonOrThrow(res);
  return data.url;
}

export async function connectConfluenceDc({ baseUrl, personalAccessToken, username }) {
  const res = await apiFetchWithAuth("/api/confluence/connect/dc", {
    method: "POST",
    body: JSON.stringify({
      base_url: baseUrl,
      personal_access_token: personalAccessToken,
      username,
    }),
  });
  return jsonOrThrow(res);
}

export async function disconnectConfluence() {
  const res = await apiFetchWithAuth("/api/confluence/disconnect", { method: "DELETE" });
  return jsonOrThrow(res);
}

export async function searchConfluencePages(query) {
  const q = String(query || "").trim();
  if (!q) return { results: [] };
  const res = await apiFetchWithAuth(`/api/confluence/search?q=${encodeURIComponent(q)}`);
  return jsonOrThrow(res);
}

export async function fetchConfluencePage(pageId) {
  const clean = String(pageId || "").trim();
  if (!clean) throw new Error("No page id");
  const res = await apiFetch(`/api/confluence/page/${encodeURIComponent(clean)}`);
  return jsonOrThrow(res);
}
