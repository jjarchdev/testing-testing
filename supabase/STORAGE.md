# Supabase Storage — scenario images

Bucket: `scenario-images` (public — employees load images via `<img src>`).

Create it in the dashboard (Storage → New bucket → public), or run:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scenario-images',
  'scenario-images',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read scenario-images" on storage.objects;
create policy "Public read scenario-images"
  on storage.objects for select
  to public
  using (bucket_id = 'scenario-images');
```

The API may create/make-public this bucket on first upload when using `SUPABASE_SECRET_KEY`. If that fails, use the SQL above.

Re-upload any scenario still using a `/uploads/...` path (those do not work on Render).

For multi-image, run `supabase/migrations/004_scenario_images.sql`.

Check with `npm run check:supabase`: `storageBucket: "scenario-images"`, `storagePublic: true`, `imageUrlsColumn: true`.
