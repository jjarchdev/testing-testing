-- Confluence integration
--
-- Adds:
--   * confluence_connections: single-row table with the admin's OAuth (Cloud) or
--     PAT (Data Center) credentials, encrypted at rest.
--   * confluence_oauth_states: short-lived CSRF state tokens for the OAuth dance.
--   * columns on scenarios linking to a Confluence page.
--
-- Everything about the connection stays server-only (RLS blocks anon/authenticated).
-- Employees can only read Confluence content via the /api/confluence/page/:id
-- proxy, and only for pages linked from a published scenario.

create table if not exists public.confluence_connections (
  id boolean primary key default true check (id = true),   -- singleton
  flavor text not null check (flavor in ('cloud', 'dc')),
  base_url text not null,               -- e.g. https://acme.atlassian.net/wiki  or  https://confluence.acme.com
  cloud_id text,                        -- Cloud only, from /oauth/token/accessible-resources
  display_name text,                    -- Site name (shown in admin UI)
  account_label text,                   -- Email / username of the connected admin
  access_token_enc text not null,       -- AES-256-GCM(base64): iv || tag || ciphertext
  refresh_token_enc text,               -- Cloud only
  expires_at timestamptz,
  scopes text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.confluence_connections enable row level security;
-- No policies for anon / authenticated: only the service_role key (server) can read/write.
grant all on table public.confluence_connections to service_role;

create table if not exists public.confluence_oauth_states (
  state text primary key,
  code_verifier text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);

alter table public.confluence_oauth_states enable row level security;
grant all on table public.confluence_oauth_states to service_role;

-- Scenario -> Confluence page link
alter table public.scenarios
  add column if not exists confluence_page_id text,
  add column if not exists confluence_page_url text,
  add column if not exists confluence_page_title text;

drop view if exists public.scenarios_employee;
drop view if exists public.scenarios_admin;

create view public.scenarios_employee as
select
  s.id,
  c.label as category,
  s.title,
  s.situation as scenario,
  s.solution,
  s.tags,
  s.sort_order,
  s.updated_at,
  s.image_url,
  s.confluence_page_id,
  s.confluence_page_url,
  s.confluence_page_title
from public.scenarios s
join public.categories c on c.slug = s.category_slug
where s.is_published = true
order by s.sort_order, s.id;

create view public.scenarios_admin as
select
  s.id,
  c.label as category,
  s.title,
  s.situation as scenario,
  s.solution,
  s.tags,
  s.sort_order,
  s.is_published,
  s.updated_at,
  s.image_url,
  s.confluence_page_id,
  s.confluence_page_url,
  s.confluence_page_title
from public.scenarios s
join public.categories c on c.slug = s.category_slug
order by s.sort_order, s.id;

grant select on public.scenarios_employee to anon, authenticated, service_role;
grant select on public.scenarios_admin to service_role;
