/**
 * One-time Supabase Storage setup for scenario images.
 *
 * Bucket name: scenario-images
 * Public: yes (employees load images anonymously via <img src>)
 *
 * Preferred: Dashboard → Storage → New bucket → name `scenario-images` → Public.
 *
 * Or run this in SQL Editor (requires storage schema access):
 *
 * ```sql
 * insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
 * values (
 *   'scenario-images',
 *   'scenario-images',
 *   true,
 *   5242880,
 *   array['image/jpeg','image/png','image/webp','image/gif']
 * )
 * on conflict (id) do update
 *   set public = true,
 *       file_size_limit = excluded.file_size_limit,
 *       allowed_mime_types = excluded.allowed_mime_types;
 *
 * -- Public read for anonymous employees (service role still uploads via secret key)
 * drop policy if exists "Public read scenario-images" on storage.objects;
 * create policy "Public read scenario-images"
 *   on storage.objects for select
 *   to public
 *   using (bucket_id = 'scenario-images');
 * ```
 *
 * The API also tries to create/make-public this bucket on first upload when using
 * SUPABASE_SECRET_KEY. If that fails (restricted project), use the SQL above.
 *
 * After setup: re-open any scenario that still has a `/uploads/...` image path and
 * upload the image again (those relative paths do not work on Render).
 *
 * Multi-image: run `supabase/migrations/004_scenario_images.sql` so scenarios have
 * an `image_urls text[]` column (max 8 images in the app).
 *
 * Verify: `npm run check:supabase` should report `storageBucket: "scenario-images"`,
 * `storagePublic: true`, and `imageUrlsColumn: true`.
 */
