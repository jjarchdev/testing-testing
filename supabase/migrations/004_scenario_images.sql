-- Multi-image support: image_urls text[] (source of truth)
-- Keeps image_url as the first image for one-release compatibility.

alter table public.scenarios
  add column if not exists image_urls text[] not null default '{}'::text[];

-- Backfill from legacy single image_url when array is still empty
update public.scenarios
set image_urls = array[image_url]
where image_url is not null
  and trim(image_url) <> ''
  and cardinality(image_urls) = 0;

-- Keep image_url in sync with first array entry for older readers
update public.scenarios
set image_url = case
  when cardinality(image_urls) > 0 then image_urls[1]
  else null
end;

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
