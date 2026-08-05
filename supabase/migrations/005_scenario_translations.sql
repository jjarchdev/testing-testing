-- Per-language scenario text.
--
-- Adds `translations jsonb` to scenarios, shaped as:
--   { "en": {"title": "...", "scenario": "...", "solution": "...", "tags": [...]},
--     "de": {...},
--     "sq": {...} }
-- Only the languages the admin filled in are present.
--
-- The existing `title / situation / solution / tags` columns keep working as
-- fallback text — normalised at write time from the translations map, so
-- admin listings and search still have something to display when only one
-- language was provided.

alter table public.scenarios
  add column if not exists translations jsonb not null default '{}'::jsonb;

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
  s.translations,
  s.sort_order,
  s.updated_at,
  s.image_url,
  s.image_urls,
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
  s.translations,
  s.sort_order,
  s.is_published,
  s.updated_at,
  s.image_url,
  s.image_urls,
  s.confluence_page_id,
  s.confluence_page_url,
  s.confluence_page_title
from public.scenarios s
join public.categories c on c.slug = s.category_slug
order by s.sort_order, s.id;

grant select on public.scenarios_employee to anon, authenticated, service_role;
grant select on public.scenarios_admin to service_role;
