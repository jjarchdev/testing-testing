// Supabase Auth verification + admin allowlist.
//
// The app does not trust Supabase Auth's JWT directly for authorisation.
// Instead it exchanges a verified Supabase access token for the app's own
// httpOnly qm_admin cookie, gated by an allowlist stored in public.app_admins.

import { getSupabase, isSupabaseConfigured } from "./db.js";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/**
 * Verify a Supabase Auth access token. Returns { email, id } on success,
 * or null if the token is invalid, expired, or the caller isn't configured
 * for Supabase.
 */
export async function verifySupabaseAccessToken(accessToken) {
  if (!accessToken || typeof accessToken !== "string") return null;
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  try {
    const { data, error } = await sb.auth.getUser(accessToken);
    if (error || !data?.user?.email) return null;
    return { email: normalizeEmail(data.user.email), id: data.user.id };
  } catch {
    return null;
  }
}

/**
 * True if this email appears in public.app_admins with is_active = true.
 * Case-insensitive.
 */
export async function isAllowedAdmin(email) {
  if (!isSupabaseConfigured()) return false;
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const sb = getSupabase();
  const { data, error } = await sb
    .from("app_admins")
    .select("email, is_active")
    .eq("email", normalized)
    .maybeSingle();
  if (error) throw error;
  return !!(data && data.is_active !== false);
}

/**
 * True when the admin allowlist is empty. Used to gate bootstrap
 * (ADMIN_PASSWORD login only works while there are no real admins yet).
 */
export async function isAllowlistEmpty() {
  if (!isSupabaseConfigured()) return true;
  const sb = getSupabase();
  const { count, error } = await sb
    .from("app_admins")
    .select("email", { count: "exact", head: true })
    .eq("is_active", true);
  if (error) throw error;
  return (count || 0) === 0;
}

export async function listAdmins() {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from("app_admins")
    .select("email, invited_by, invited_at, is_active")
    .order("invited_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function inviteAdmin({ email, invitedBy }) {
  if (!isSupabaseConfigured()) {
    const err = new Error("Supabase is required to manage admins");
    err.status = 503;
    throw err;
  }
  const normalized = normalizeEmail(email);
  if (!/^\S+@\S+\.\S+$/.test(normalized)) {
    const err = new Error("Invalid email");
    err.status = 400;
    throw err;
  }
  const sb = getSupabase();
  const { data, error } = await sb
    .from("app_admins")
    .upsert(
      {
        email: normalized,
        invited_by: invitedBy ? normalizeEmail(invitedBy) : null,
        is_active: true,
      },
      { onConflict: "email" }
    )
    .select("email, invited_by, invited_at, is_active")
    .single();
  if (error) throw error;
  return data;
}

export async function revokeAdmin(email) {
  if (!isSupabaseConfigured()) {
    const err = new Error("Supabase is required to manage admins");
    err.status = 503;
    throw err;
  }
  const normalized = normalizeEmail(email);
  if (!normalized) {
    const err = new Error("Invalid email");
    err.status = 400;
    throw err;
  }
  const sb = getSupabase();
  const { error } = await sb
    .from("app_admins")
    .update({ is_active: false })
    .eq("email", normalized);
  if (error) throw error;
  return { ok: true };
}

/**
 * True when the app_admins table exists (migration 004 has been applied).
 */
export async function isAdminsTableReady() {
  if (!isSupabaseConfigured()) return true;
  try {
    const sb = getSupabase();
    const { error } = await sb.from("app_admins").select("email").limit(1);
    if (!error) return true;
    const msg = String(error.message || "");
    if (/app_admins|relation|42P01/i.test(msg)) return false;
    return true;
  } catch {
    return true;
  }
}
