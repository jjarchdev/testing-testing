import { createClient } from "@supabase/supabase-js";
import { apiFetch } from "./api.js";

/**
 * Browser Supabase client used only for Auth. Config comes from the server
 * via /api/config (so we don't need VITE_ env vars at build time — matches
 * the pattern the app already uses for admin config).
 *
 * We lazily initialise on first use; if the server says Supabase isn't
 * configured we return null and the UI hides the sign-in options.
 */

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
      // Detect the tokens Supabase drops in the URL fragment after magic
      // link / OAuth redirects and stash them in localStorage. Then we
      // read them, POST to /api/auth/session, and clear the fragment.
      detectSessionInUrl: true,
    },
  });
}

export async function getSupabaseAuth() {
  if (!clientPromise) clientPromise = loadClient();
  return clientPromise;
}

/**
 * After Supabase Auth returns a session (from any provider), exchange the
 * access_token for the app's httpOnly session cookie.
 */
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

/** Path where the reset email should land the user. */
export function passwordResetRedirectUrl(lng) {
  const path = `/${lng || "en"}/admin/reset`;
  try {
    const u = new URL(path, window.location.origin);
    return u.toString();
  } catch {
    return path;
  }
}

/** OAuth (Google, etc.) redirects the user back to the login page. */
export function oauthRedirectUrl(lng) {
  const path = `/${lng || "en"}/admin/login`;
  try {
    const u = new URL(path, window.location.origin);
    return u.toString();
  } catch {
    return path;
  }
}
