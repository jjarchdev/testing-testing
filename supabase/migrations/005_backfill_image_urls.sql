-- One-shot backfill: copy image_url into image_urls when the array is still empty.
-- Safe to re-run. Use after deploying multi-image if older saves only wrote image_url.

update public.scenarios
set image_urls = array[image_url]
where image_url is not null
  and trim(image_url) <> ''
  and cardinality(coalesce(image_urls, '{}'::text[])) = 0;
