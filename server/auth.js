import { getSupabase, isSupabaseConfigured } from "./db.js";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

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

export async function tryAutoBootstrap(email) {
  if (!isSupabaseConfigured()) return false;
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const gate = normalizeEmail(process.env.BOOTSTRAP_ADMIN_EMAIL || "");
  if (gate && gate !== normalized) return false;
  const empty = await isAllowlistEmpty();
  if (!empty) return false;
  const sb = getSupabase();
  const { error } = await sb
    .from("app_admins")
    .insert({ email: normalized, invited_by: null, is_active: true });
  if (error) {
    return false;
  }
  return true;
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

export async function inviteAdmin({ email, invitedBy, redirectTo }) {
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

  const { data: row, error: upsertError } = await sb
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
  if (upsertError) throw upsertError;

  let emailStatus = "sent";
  let emailError = null;
  try {
    const options = redirectTo ? { redirectTo } : {};
    const { error: inviteError } = await sb.auth.admin.inviteUserByEmail(
      normalized,
      options
    );
    if (inviteError) {
      const msg = String(inviteError.message || "");
      if (/already been registered|already exists|user_already_exists/i.test(msg)) {
        const { error: magicError } = await sb.auth.signInWithOtp({
          email: normalized,
          options: redirectTo ? { emailRedirectTo: redirectTo } : {},
        });
        if (magicError) {
          emailStatus = "failed";
          emailError = magicError.message || String(magicError);
        } else {
          emailStatus = "existing_user_magic_link";
        }
      } else {
        emailStatus = "failed";
        emailError = msg;
      }
    }
  } catch (e) {
    emailStatus = "failed";
    emailError = e?.message || String(e);
  }

  return { ...row, email_status: emailStatus, email_error: emailError };
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
