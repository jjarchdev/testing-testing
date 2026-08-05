// Confluence integration.
//
// Supports two flavors:
//   * cloud — Atlassian 3LO OAuth 2.0 (per-user). The admin signs in with their
//             own Atlassian identity; access/refresh tokens are stored encrypted.
//   * dc    — Confluence Data Center / Server. The admin pastes a Personal
//             Access Token (Bearer). The PAT is stored encrypted.
//
// Only one connection exists at a time (single-admin model). Employees never see
// credentials — they call the server proxy for a page, and only pages linked
// from a **published** scenario are returned.

import { getSupabase, isSupabaseConfigured } from "./db.js";
import { decryptSecret, encryptSecret, randomToken } from "./secrets.js";
import { sanitizeHtml } from "./htmlSanitize.js";

const CLOUD_AUTHORIZE_URL = "https://auth.atlassian.com/authorize";
const CLOUD_TOKEN_URL = "https://auth.atlassian.com/oauth/token";
const CLOUD_ACCESSIBLE_URL = "https://api.atlassian.com/oauth/token/accessible-resources";
const CLOUD_API_BASE = "https://api.atlassian.com/ex/confluence";

const DEFAULT_SCOPES = [
  "read:confluence-content.summary",
  "read:confluence-content.all",
  "read:confluence-space.summary",
  "search:confluence",
  "offline_access",
];

function requireSupabase() {
  if (!isSupabaseConfigured()) {
    const err = new Error("Confluence integration requires Supabase to be configured.");
    err.status = 503;
    throw err;
  }
  return getSupabase();
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function assertConfigured(name, value) {
  if (!value) {
    const err = new Error(`Missing ${name}`);
    err.status = 503;
    throw err;
  }
  return value;
}

/* ---------- Connection storage ---------- */

async function loadConnectionRow() {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("confluence_connections")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function upsertConnectionRow(row) {
  const sb = requireSupabase();
  const payload = { id: true, ...row, updated_at: new Date().toISOString() };
  const { error } = await sb.from("confluence_connections").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function deleteConnection() {
  const sb = requireSupabase();
  const { error } = await sb.from("confluence_connections").delete().eq("id", true);
  if (error) throw error;
  return { ok: true };
}

export async function getConnectionStatus() {
  if (!isSupabaseConfigured()) {
    return { connected: false, reason: "supabase_not_configured" };
  }
  try {
    const row = await loadConnectionRow();
    if (!row) return { connected: false };
    return {
      connected: true,
      flavor: row.flavor,
      base_url: row.base_url,
      display_name: row.display_name || null,
      account_label: row.account_label || null,
    };
  } catch (e) {
    return { connected: false, reason: "read_error", detail: e?.message || String(e) };
  }
}

/* ---------- OAuth state ---------- */

async function saveOauthState(state, codeVerifier) {
  const sb = requireSupabase();
  const { error } = await sb.from("confluence_oauth_states").insert({
    state,
    code_verifier: codeVerifier,
  });
  if (error) throw error;
}

async function consumeOauthState(state) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("confluence_oauth_states")
    .delete()
    .eq("state", state)
    .select("state, code_verifier, expires_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data;
}

async function cleanupOauthStates() {
  try {
    const sb = requireSupabase();
    await sb
      .from("confluence_oauth_states")
      .delete()
      .lt("expires_at", new Date().toISOString());
  } catch {
    /* best-effort */
  }
}

/* ---------- PKCE ---------- */

import { createHash } from "crypto";

function pkce() {
  const verifier = randomToken(48);
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return { verifier, challenge };
}

/* ---------- Cloud OAuth ---------- */

function cloudClientId() {
  return (process.env.CONFLUENCE_CLIENT_ID || "").trim();
}
function cloudClientSecret() {
  return (process.env.CONFLUENCE_CLIENT_SECRET || "").trim();
}
function cloudRedirectUri() {
  return (process.env.CONFLUENCE_REDIRECT_URI || "").trim();
}
function cloudScopes() {
  const raw = (process.env.CONFLUENCE_SCOPES || "").trim();
  return raw ? raw.split(/[\s,]+/).filter(Boolean) : DEFAULT_SCOPES;
}

export function cloudConfigured() {
  return !!(cloudClientId() && cloudClientSecret() && cloudRedirectUri());
}

export async function getCloudAuthorizeUrl() {
  assertConfigured("CONFLUENCE_CLIENT_ID", cloudClientId());
  assertConfigured("CONFLUENCE_CLIENT_SECRET", cloudClientSecret());
  assertConfigured("CONFLUENCE_REDIRECT_URI", cloudRedirectUri());
  await cleanupOauthStates();
  const state = randomToken(24);
  const { verifier, challenge } = pkce();
  await saveOauthState(state, verifier);
  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: cloudClientId(),
    scope: cloudScopes().join(" "),
    redirect_uri: cloudRedirectUri(),
    state,
    response_type: "code",
    prompt: "consent",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${CLOUD_AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCloudCode(code, codeVerifier) {
  const res = await fetch(CLOUD_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: cloudClientId(),
      client_secret: cloudClientSecret(),
      code,
      redirect_uri: cloudRedirectUri(),
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Atlassian token exchange failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function refreshCloudToken(refreshToken) {
  const res = await fetch(CLOUD_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: cloudClientId(),
      client_secret: cloudClientSecret(),
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Atlassian refresh failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function fetchCloudResources(accessToken) {
  const res = await fetch(CLOUD_ACCESSIBLE_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Atlassian accessible-resources failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function fetchCloudMe(accessToken, cloudId) {
  try {
    const res = await fetch(`${CLOUD_API_BASE}/${cloudId}/rest/api/user/current`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.email || data?.displayName || null;
  } catch {
    return null;
  }
}

export async function completeCloudOauth({ code, state }) {
  if (!code || !state) throw new Error("Missing code or state");
  const stored = await consumeOauthState(state);
  if (!stored) {
    const err = new Error("OAuth state invalid or expired. Restart the connection flow.");
    err.status = 400;
    throw err;
  }
  const tokens = await exchangeCloudCode(code, stored.code_verifier);
  const accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token || null;
  const expiresIn = Number(tokens.expires_in || 3600);

  const resources = await fetchCloudResources(accessToken);
  const site = Array.isArray(resources)
    ? resources.find((r) => (r.scopes || []).some((s) => s.startsWith("read:confluence")))
      || resources[0]
    : null;
  if (!site?.id) {
    throw new Error(
      "The connected Atlassian account has no Confluence site available. Ask an admin to grant the app access."
    );
  }
  const accountLabel = await fetchCloudMe(accessToken, site.id);

  await upsertConnectionRow({
    flavor: "cloud",
    base_url: site.url || null,
    cloud_id: site.id,
    display_name: site.name || null,
    account_label: accountLabel,
    access_token_enc: encryptSecret(accessToken),
    refresh_token_enc: refreshToken ? encryptSecret(refreshToken) : null,
    expires_at: new Date(Date.now() + (expiresIn - 60) * 1000).toISOString(),
    scopes: tokens.scope ? tokens.scope.split(/\s+/) : cloudScopes(),
  });

  return { ok: true };
}

async function ensureFreshCloudToken(row) {
  if (row.flavor !== "cloud") return row;
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 30_000) return row;
  if (!row.refresh_token_enc) {
    const err = new Error("Confluence access token expired and no refresh token stored. Reconnect.");
    err.status = 401;
    throw err;
  }
  const refreshToken = decryptSecret(row.refresh_token_enc);
  const tokens = await refreshCloudToken(refreshToken);
  const expiresIn = Number(tokens.expires_in || 3600);
  const patch = {
    access_token_enc: encryptSecret(tokens.access_token),
    expires_at: new Date(Date.now() + (expiresIn - 60) * 1000).toISOString(),
  };
  if (tokens.refresh_token) {
    patch.refresh_token_enc = encryptSecret(tokens.refresh_token);
  }
  await upsertConnectionRow({ ...row, ...patch });
  return { ...row, ...patch };
}

/* ---------- Data Center (PAT) ---------- */

function normalizeDcBaseUrl(url) {
  const trimmed = String(url || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    const err = new Error("Confluence base URL must start with http:// or https://");
    err.status = 400;
    throw err;
  }
  return trimmed;
}

export async function saveDcConnection({ baseUrl, personalAccessToken, username }) {
  const base = normalizeDcBaseUrl(baseUrl);
  const pat = String(personalAccessToken || "").trim();
  if (!pat) {
    const err = new Error("Personal Access Token required");
    err.status = 400;
    throw err;
  }

  // Verify credentials by calling the current-user endpoint.
  const verifyUrl = `${base}/rest/api/user/current`;
  const res = await fetch(verifyUrl, {
    headers: { Authorization: `Bearer ${pat}`, Accept: "application/json" },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("Confluence rejected the PAT. Double-check the token and its permissions.");
  }
  if (!res.ok) {
    throw new Error(`Confluence verification failed (${res.status}). Is the base URL correct?`);
  }
  const me = await res.json().catch(() => ({}));

  await upsertConnectionRow({
    flavor: "dc",
    base_url: base,
    cloud_id: null,
    display_name: null,
    account_label: me?.email || me?.displayName || username || null,
    access_token_enc: encryptSecret(pat),
    refresh_token_enc: null,
    expires_at: null,
    scopes: [],
  });
  return { ok: true };
}

/* ---------- API calls (using stored connection) ---------- */

function buildCloudUrl(row, pathAndQuery) {
  if (!row.cloud_id) throw new Error("Cloud connection missing cloud_id");
  const clean = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  return `${CLOUD_API_BASE}/${row.cloud_id}${clean}`;
}

function buildDcUrl(row, pathAndQuery) {
  const clean = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  return `${row.base_url}${clean}`;
}

async function confluenceFetch(row, pathAndQuery, { method = "GET" } = {}) {
  const fresh = await ensureFreshCloudToken(row);
  const token = decryptSecret(fresh.access_token_enc);
  const url =
    fresh.flavor === "cloud"
      ? buildCloudUrl(fresh, pathAndQuery)
      : buildDcUrl(fresh, pathAndQuery);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 401 || res.status === 403) {
    const err = new Error("Confluence rejected the stored credentials. Reconnect from the admin panel.");
    err.status = 401;
    throw err;
  }
  if (res.status === 404) {
    const err = new Error("Confluence page not found");
    err.status = 404;
    throw err;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Confluence request failed (${res.status}): ${body.slice(0, 200)}`);
    err.status = res.status >= 500 ? 502 : res.status;
    throw err;
  }
  return res.json();
}

function requireConnection() {
  return loadConnectionRow().then((row) => {
    if (!row) {
      const err = new Error("Confluence not connected");
      err.status = 404;
      throw err;
    }
    return row;
  });
}

/* Page fetch + sanitize */

function extractCloudPageHtml(json) {
  const body = json?.body || {};
  const html =
    body?.view?.value ||
    body?.export_view?.value ||
    body?.styled_view?.value ||
    "";
  return String(html || "");
}

function normalizePage(row, json) {
  const title = json?.title || "";
  const id = String(json?.id || "");
  const rawHtml = extractCloudPageHtml(json);
  const sanitized = sanitizeHtml(rawHtml);
  const webui = json?._links?.webui || json?.webui || "";
  const url = webui
    ? row.flavor === "cloud"
      ? `${row.base_url}${webui}`
      : `${row.base_url}${webui.startsWith("/") ? "" : "/"}${webui}`
    : "";
  const updated = json?.version?.when || json?.version?.friendlyWhen || null;
  return { id, title, url, html: sanitized, updated_at: updated };
}

export async function fetchPageById(pageId) {
  const cleanId = String(pageId || "").trim();
  if (!/^[a-zA-Z0-9_.:-]+$/.test(cleanId)) {
    const err = new Error("Invalid Confluence page id");
    err.status = 400;
    throw err;
  }
  const row = await requireConnection();
  const path = `/rest/api/content/${encodeURIComponent(cleanId)}?expand=body.view,version,space`;
  const json = await confluenceFetch(row, path);
  return normalizePage(row, json);
}

export async function searchPages(query) {
  const q = String(query || "").trim();
  if (!q) return { results: [] };
  const row = await requireConnection();
  const cql = `type = page AND text ~ "${q.replace(/["\\]/g, " ")}"`;
  const path = `/rest/api/search?limit=20&cql=${encodeURIComponent(cql)}`;
  const json = await confluenceFetch(row, path);
  const results = Array.isArray(json?.results)
    ? json.results
        .filter((r) => r?.content?.type === "page" || r?.entityType === "content")
        .map((r) => {
          const content = r.content || r;
          const webui = content?._links?.webui || "";
          const url = webui ? `${row.base_url}${webui.startsWith("/") ? "" : "/"}${webui}` : "";
          return {
            id: String(content?.id || ""),
            title: content?.title || r?.title || "(untitled)",
            url,
            space: content?.space?.name || r?.resultGlobalContainer?.title || null,
          };
        })
        .filter((r) => r.id)
    : [];
  return { results };
}
