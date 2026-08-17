alter table public.scenarios
  add column if not exists solution_as_checklist boolean not null default false;

alter table public.scenarios
  add column if not exists verdict text;

alter table public.scenarios
  drop constraint if exists scenarios_verdict_check;

alter table public.scenarios
  add constraint scenarios_verdict_check
  check (verdict is null or verdict in ('to_be_rejected', 'acceptable', 'grey_area'));

update public.scenarios
set solution_as_checklist = true
where solution_as_checklist = false
  and solution ~ E'(^|\n)[[:space:]]*[0-9]+\\.[[:space:]]+[^\n]+\n[[:space:]]*[0-9]+\\.[[:space:]]+';

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
  s.confluence_page_title,
  s.solution_as_checklist,
  s.verdict
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
  s.confluence_page_title,
  s.solution_as_checklist,
  s.verdict
from public.scenarios s
join public.categories c on c.slug = s.category_slug
order by s.sort_order, s.id;

grant select on public.scenarios_employee to anon, authenticated, service_role;
grant select on public.scenarios_admin to service_role;
