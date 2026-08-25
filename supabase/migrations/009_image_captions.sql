-- Optional per-image captions: jsonb map of { "<image url>": "caption text" }.
-- Keyed by URL (not index) so reordering/removing images never mismatches captions.

alter table public.scenarios
  add column if not exists image_captions jsonb not null default '{}'::jsonb;

drop view if exists public.scenarios_employee;
drop view if exists public.scenarios_admin;

create view public.scenarios_employee as
select
  s.id,
  c.label as category,
  coalesce(
    (
      select array_agg(wp.label order by wp.sort_order, wp.label)
      from public.category_work_packages cwp
      join public.work_packages wp on wp.slug = cwp.wp_slug
      where cwp.category_slug = c.slug
    ),
    '{}'::text[]
  ) as category_wps,
  s.title,
  s.situation as scenario,
  s.solution,
  s.tags,
  s.translations,
  s.sort_order,
  s.updated_at,
  s.image_url,
  s.image_urls,
  s.image_captions,
  s.confluence_page_id,
  s.confluence_page_url,
  s.confluence_page_title,
  s.solution_as_checklist,
  s.acceptance_as_checklist,
  s.verdict
from public.scenarios s
join public.categories c on c.slug = s.category_slug
where s.is_published = true
order by s.sort_order, s.id;

create view public.scenarios_admin as
select
  s.id,
  c.label as category,
  coalesce(
    (
      select array_agg(wp.label order by wp.sort_order, wp.label)
      from public.category_work_packages cwp
      join public.work_packages wp on wp.slug = cwp.wp_slug
      where cwp.category_slug = c.slug
    ),
    '{}'::text[]
  ) as category_wps,
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
  s.image_captions,
  s.confluence_page_id,
  s.confluence_page_url,
  s.confluence_page_title,
  s.solution_as_checklist,
  s.acceptance_as_checklist,
  s.verdict
from public.scenarios s
join public.categories c on c.slug = s.category_slug
order by s.sort_order, s.id;

grant select on public.scenarios_employee to anon, authenticated, service_role;
grant select on public.scenarios_admin to service_role;
