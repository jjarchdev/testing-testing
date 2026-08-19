alter table public.categories
  add column if not exists wp text;

alter table public.categories
  drop constraint if exists categories_wp_len;

alter table public.categories
  add constraint categories_wp_len check (wp is null or char_length(wp) <= 32);

alter table public.scenarios
  add column if not exists acceptance_as_checklist boolean not null default false;

drop view if exists public.scenarios_employee;
drop view if exists public.scenarios_admin;

create view public.scenarios_employee as
select
  s.id,
  c.label as category,
  c.wp as category_wp,
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
  c.wp as category_wp,
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
  s.confluence_page_title,
  s.solution_as_checklist,
  s.acceptance_as_checklist,
  s.verdict
from public.scenarios s
join public.categories c on c.slug = s.category_slug
order by s.sort_order, s.id;

grant select on public.scenarios_employee to anon, authenticated, service_role;
grant select on public.scenarios_admin to service_role;
