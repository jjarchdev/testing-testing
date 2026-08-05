-- Admin allowlist for Supabase Auth
--
-- Sign-in flow (client): user signs in with Supabase Auth (email/password,
-- magic link, or Google OAuth). Client posts the resulting access_token to
-- POST /api/auth/session. Server verifies the token with Supabase, checks
-- the returned email is present in app_admins with is_active = true, then
-- issues the app's own httpOnly qm_admin cookie.
--
-- Rows here are NOT auto-created on Supabase Auth signup. An existing admin
-- (or the bootstrap ADMIN_PASSWORD login) must POST /api/admin/admins first.
-- This keeps random self-signup off the admin surface even if you enable
-- open Auth providers in Supabase.

create table if not exists public.app_admins (
  email text primary key,               -- normalised to lower-case by the server
  invited_by text,                      -- email of the admin who added this row (null for bootstrap)
  invited_at timestamptz not null default now(),
  is_active boolean not null default true
);

-- Case-insensitive lookup helper (defence in depth; server also lower-cases).
create index if not exists app_admins_email_lower_idx
  on public.app_admins (lower(email));

alter table public.app_admins enable row level security;
-- No policies for anon / authenticated: only the service_role key (server) can read/write.
grant all on table public.app_admins to service_role;
