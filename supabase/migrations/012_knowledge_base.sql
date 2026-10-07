-- Knowledge base: picture-based guides posted by admins.
-- This only adds a new table. Nothing existing is changed or removed.
-- Steps (a photo plus a short text per language) are stored inside the guide row as JSON.

create table if not exists public.guides (
  id bigint generated always as identity primary key,
  title text not null check (char_length(trim(title)) > 0),
  translations jsonb not null default '{}'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  wp_slugs text[] not null default '{}'::text[],
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guides_published_sort_idx
  on public.guides (is_published, sort_order, id);

-- Only the server (secret key) reads and writes this table; the browser never queries it directly.
alter table public.guides enable row level security;

revoke all on public.guides from anon, authenticated;

grant select, insert, update, delete on public.guides to service_role;
grant usage, select on all sequences in schema public to service_role;
