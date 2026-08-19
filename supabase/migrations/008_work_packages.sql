create table if not exists public.work_packages (
  slug text primary key,
  label text not null unique,
  sort_order integer not null default 0,
  constraint work_packages_label_len check (char_length(label) between 1 and 32)
);

create table if not exists public.category_work_packages (
  category_slug text not null references public.categories (slug) on delete cascade,
  wp_slug text not null references public.work_packages (slug) on delete restrict,
  primary key (category_slug, wp_slug)
);

drop view if exists public.scenarios_employee;
drop view if exists public.scenarios_admin;

do $$
declare
  r record;
  wp_slug text;
  n int := 0;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'categories'
      and column_name = 'wp'
  ) then
    for r in
      select distinct trim(wp) as label
      from public.categories
      where wp is not null and length(trim(wp)) > 0
    loop
      n := n + 1;
      wp_slug := left(
        trim(both '_' from regexp_replace(lower(r.label), '[^a-z0-9]+', '_', 'g')),
        64
      );
      if wp_slug is null or wp_slug = '' then
        wp_slug := 'wp_' || n::text;
      end if;
      if exists (select 1 from public.work_packages where slug = wp_slug) then
        wp_slug := wp_slug || '_' || n::text;
      end if;
      insert into public.work_packages (slug, label, sort_order)
      values (wp_slug, left(r.label, 32), n)
      on conflict (label) do nothing;
    end loop;

    insert into public.category_work_packages (category_slug, wp_slug)
    select c.slug, wp.slug
    from public.categories c
    join public.work_packages wp on wp.label = trim(c.wp)
    where c.wp is not null and length(trim(c.wp)) > 0
    on conflict do nothing;

    alter table public.categories drop constraint if exists categories_wp_len;
    alter table public.categories drop column if exists wp;
  end if;
end $$;

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
  s.confluence_page_id,
  s.confluence_page_url,
  s.confluence_page_title,
  s.solution_as_checklist,
  s.acceptance_as_checklist,
  s.verdict
from public.scenarios s
join public.categories c on c.slug = s.category_slug
order by s.sort_order, s.id;

grant select, insert, update, delete on public.work_packages to service_role;
grant select, insert, update, delete on public.category_work_packages to service_role;
grant select on public.scenarios_employee to anon, authenticated, service_role;
grant select on public.scenarios_admin to service_role;
