-- New scenarios (a topic with several situations) live in their own tables.
-- Nothing here touches public.scenarios, its views, or public.categories, so existing data is unaffected.
-- Ids start at 100000 so they never collide with the ids of existing scenarios.

create table if not exists public.scenarios_v2 (
  id bigint generated always as identity (start with 100000) primary key,
  title text not null check (char_length(trim(title)) > 0),
  tags text[] not null default '{}'::text[],
  translations jsonb not null default '{}'::jsonb,
  situations jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scenarios_v2_published_sort_idx
  on public.scenarios_v2 (is_published, sort_order, id);

create table if not exists public.scenarios_v2_work_packages (
  scenario_id bigint not null references public.scenarios_v2 (id) on delete cascade,
  wp_slug text not null references public.work_packages (slug) on delete restrict,
  primary key (scenario_id, wp_slug)
);

-- Only the server (secret key) reads and writes these tables; the browser never queries them directly.
alter table public.scenarios_v2 enable row level security;
alter table public.scenarios_v2_work_packages enable row level security;

revoke all on public.scenarios_v2 from anon, authenticated;
revoke all on public.scenarios_v2_work_packages from anon, authenticated;

grant select, insert, update, delete on public.scenarios_v2 to service_role;
grant select, insert, update, delete on public.scenarios_v2_work_packages to service_role;
grant usage, select on all sequences in schema public to service_role;
