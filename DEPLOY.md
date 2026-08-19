# Deploy checklist: Supabase + Render

Follow these steps in order. The browser never talks to Supabase directly — only the Express server uses the Supabase **secret** key (`sb_secret_...`).

## 1. Supabase (one-time)

1. Create a project at https://supabase.com
2. Open **SQL Editor** → New query
3. Paste and run the full contents of [`supabase/migrations/001_schema.sql`](supabase/migrations/001_schema.sql)
4. If the DB already existed before images: also run [`supabase/migrations/002_scenario_image.sql`](supabase/migrations/002_scenario_image.sql)
4a. For Confluence support, run [`supabase/migrations/003_confluence.sql`](supabase/migrations/003_confluence.sql)
4b. For per-user Supabase Auth admin sign-in, run [`supabase/migrations/004_admins.sql`](supabase/migrations/004_admins.sql), then in the Supabase dashboard:
   * **Authentication → Providers → Email**: leave enabled (default).
   * **Authentication → URL Configuration**: set **Site URL** to `https://<your-service>.onrender.com` and add both that URL and `http://localhost:5173/*` under **Redirect URLs**.
   * **Authentication → Email Templates**: optionally rebrand the sign-up / reset templates.
4b. For multiple images per scenario, run [`supabase/migrations/004_scenario_images.sql`](supabase/migrations/004_scenario_images.sql)
4c. For per-language scenario text (required by the current admin UI), run [`supabase/migrations/005_scenario_translations.sql`](supabase/migrations/005_scenario_translations.sql)
4d. For procedure checklist mode and verdicts, run [`supabase/migrations/006_solution_mode_and_verdict.sql`](supabase/migrations/006_solution_mode_and_verdict.sql)
4e. For acceptance criteria and category WP (required by the current admin and reader UI), run [`supabase/migrations/007_acceptance_and_wp.sql`](supabase/migrations/007_acceptance_and_wp.sql)
4f. For independent work packages (Manage WPs; a category can have several), run [`supabase/migrations/008_work_packages.sql`](supabase/migrations/008_work_packages.sql). Local `npm run dev` with the file store does **not** need these SQL files.
5. Confirm tables/columns exist under **Table Editor**: `categories`, `work_packages`, `category_work_packages`, `scenarios` (with `image_urls`, `translations`, `verdict`, `acceptance_as_checklist`), and (for Manage Admins) `app_admins`
6. **Storage** (for admin image uploads): create a **public** bucket named `scenario-images` (see [`supabase/STORAGE.md`](supabase/STORAGE.md)). The server also tries to create this bucket on first upload when `SUPABASE_SECRET_KEY` is set.
7. **Project Settings → API**:
   - Copy **Project URL** → use as `SUPABASE_URL`
   - Copy the **secret** key (`sb_secret_...`) → use as `SUPABASE_SECRET_KEY`
8. Do **not** use the legacy `service_role` / anon JWT keys. Do **not** put the secret key in any `VITE_*` variable.

### If check says permission denied

In the SQL Editor, run:

```sql
grant usage on schema public to anon, authenticated, service_role;
grant select on table public.categories to anon, authenticated, service_role;
grant all on table public.categories to service_role;
grant select on table public.scenarios to anon, authenticated, service_role;
grant all on table public.scenarios to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select on public.scenarios_employee to anon, authenticated, service_role;
grant select on public.scenarios_admin to service_role;
grant all on table public.app_admins to service_role;
grant all on table public.work_packages to service_role;
grant all on table public.category_work_packages to service_role;
```

### Clear old sample data (only if you ran an older seeded migration)

```sql
delete from public.scenarios;
delete from public.categories;
```

### Local verify (optional)

```bash
# .env must include SUPABASE_URL and SUPABASE_SECRET_KEY
npm run check:supabase
```

Expect `storage: supabase` from health, and `connected`-style JSON from the check script including `storageBucket: "scenario-images"` and `storagePublic: true`. If `legacyUploadPaths` > 0, re-upload those scenario images in Admin.

## 2. Render hosting

### Option A — Blueprint (recommended)

1. Push this repo to GitHub (do **not** commit `.env`)
2. Render Dashboard → **New** → **Blueprint** → select the repo
3. Confirm service `qm-playbook` from [`render.yaml`](render.yaml)
4. Set these environment variables:

| Variable | Required | Notes |
|----------|----------|--------|
| `NODE_ENV` | yes | Already `production` in render.yaml |
| `ADMIN_PASSWORD` | yes (for env login) | Strong unique password — enables username/password Admin Portal login |
| `JWT_SECRET` | yes | Long random string (32+ chars) — signs the httpOnly admin session cookie |
| `SUPABASE_URL` | yes | From Supabase |
| `SUPABASE_SECRET_KEY` | yes | New secret key (`sb_secret_...`), not legacy service_role |
| `SUPABASE_ANON_KEY` | optional | Needed only for email sign-in/registration in the browser. Env login works without it. Must be set with `SUPABASE_URL` so CSP can allow Auth API calls to that origin. |
| `ADMIN_USER` | recommended | Extra login gate (username) for env login |
| `VITE_API_BASE` | no | Leave unset / empty (same-origin so the session cookie works) |
| `CONFLUENCE_CLIENT_ID` | no | Only for Confluence Cloud OAuth (3LO) |
| `CONFLUENCE_CLIENT_SECRET` | no | Only for Confluence Cloud OAuth |
| `CONFLUENCE_REDIRECT_URI` | no | `https://<your-service>.onrender.com/api/confluence/callback/cloud` |
| `CONFLUENCE_ENCRYPTION_KEY` | no | 32-byte hex/base64 or 32+ char string; encrypts stored Confluence tokens (falls back to a key derived from `JWT_SECRET`) |

5. Deploy. Build: `npm ci --include=dev && npm run build`. Start: `node server/index.js`

### Option B — Manual Web Service

1. **New** → **Web Service** → connect the repo
2. Runtime: Node
3. Build command: `npm ci --include=dev && npm run build`
4. Start command: `node server/index.js`
5. Add the same env vars as above
6. Deploy

### After deploy

1. Open `https://YOUR-SERVICE.onrender.com`
2. Hit `/api/health` — expect `"storage":"supabase","ok":true`. For multi-image, also expect `"imageUrlsReady":true` (run [`004_scenario_images.sql`](supabase/migrations/004_scenario_images.sql) if false).
3. Sign in at **Admin Portal** with `ADMIN_USER` + `ADMIN_PASSWORD` (env login). Supabase Auth (email/magic link) is optional if `SUPABASE_ANON_KEY` is set.
4. **Manage Categories** → create categories
5. **Add Scenario** → publish so employees can see it
6. Open **Employee Access** and confirm the scenario appears

Free Render instances sleep when idle; the first request after sleep can take ~30–60s.

### EU-region hosting (recommended for GDPR)

If any of your users are in the EU/EEA, pick EU regions when you set up
the services so the whole data path stays in-region:

- **Supabase** — at project creation, choose **eu-central-1 (Frankfurt)** or **eu-west-1 (Ireland)**. Cannot be changed later without a migration.
- **Render** — for the web service, pick **Frankfurt** in the region dropdown.

See `docs/GDPR.md` for the subprocessor DPA links you should sign, the records
of processing template, and the breach runbook.

## 3. Security baseline (before sharing the URL)

- [ ] Strong `ADMIN_PASSWORD` (not `admin123`)
- [ ] Random `JWT_SECRET` (not a dictionary word) — used to sign the `qm_admin` httpOnly cookie
- [ ] `ADMIN_USER` set
- [ ] `.env` is gitignored and never committed
- [ ] Admin session is cookie-based (`HttpOnly`, `SameSite=Lax`, `Secure` in production) — no JWT in `sessionStorage` / JS
- [ ] Employee reads of categories + published scenarios remain public by design
- [ ] If secrets were ever shared or committed: rotate Supabase secret key + admin password + JWT secret in Supabase/Render

## 4. What you do not need

- Separate frontend and API services on Render
- Putting Supabase keys in the Vite build
- Redis, Docker, or Supabase Auth for day one
