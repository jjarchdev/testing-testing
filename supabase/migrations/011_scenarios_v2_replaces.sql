-- A new-format scenario can take over an older scenario without changing or deleting the older row:
-- the older row stays in public.scenarios untouched and is simply hidden while its replacement exists.
-- Confluence link columns are carried over so a converted scenario keeps its linked page.

alter table public.scenarios_v2
  add column if not exists replaces_legacy_id bigint,
  add column if not exists confluence_page_id text,
  add column if not exists confluence_page_url text,
  add column if not exists confluence_page_title text;

create unique index if not exists scenarios_v2_replaces_legacy_id_key
  on public.scenarios_v2 (replaces_legacy_id)
  where replaces_legacy_id is not null;
