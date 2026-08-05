import { createClient } from "@supabase/supabase-js";
import { apiFetch } from "./api.js";

let clientPromise = null;

async function loadClient() {
  const res = await apiFetch("/api/config");
  if (!res.ok) return null;
  const cfg = await res.json().catch(() => null);
  if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey) return null;
  return createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export async function getSupabaseAuth() {
  if (!clientPromise) clientPromise = loadClient();
  return clientPromise;
}

export async function exchangeForAppSession(accessToken) {
  const res = await apiFetch("/api/auth/session", {
    method: "POST",
    body: JSON.stringify({ access_token: accessToken }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `Session exchange failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function passwordResetRedirectUrl(lng) {
  const path = `/${lng || "en"}/admin/reset`;
  try {
    const u = new URL(path, window.location.origin);
    return u.toString();
  } catch {
    return path;
  }
}

export function oauthRedirectUrl(lng) {
  const path = `/${lng || "en"}/admin/login`;
  try {
    const u = new URL(path, window.location.origin);
    return u.toString();
  } catch {
    return path;
  }
}
