# GDPR compliance pack

This document is a working template. Replace every `{{PLACEHOLDER}}` with your
organisation's real details before treating it as compliance evidence. It is
intentionally short — the aim is a document a small team can actually maintain.

The user-facing privacy notice lives at `/privacy` in the app; its source
translations are in `src/i18n/locales/*.json` under the `privacy` key. When you
change anything here (subprocessors, retention, purposes), update the notice too.

---

## 1. Records of processing (Art 30 GDPR)

**Controller.** `{{CONTROLLER_LEGAL_NAME}}`, `{{CONTROLLER_ADDRESS}}`.
Contact: `{{CONTROLLER_EMAIL}}` (also acts as DSAR intake).

**Application.** QM Playbook — internal knowledge base for quality-management
procedures. Deployed at `https://{{APP_HOST}}`.

**Categories of personal data:**

| Category | Data subjects | Source | Storage |
|---|---|---|---|
| Admin identifier + password | Internal admin(s) | (a) Bootstrap only: `ADMIN_USER` / `ADMIN_PASSWORD` env vars. (b) Normal: email address on the `app_admins` allowlist + password hash in Supabase Auth. | Env vars in Render; Supabase Auth managed table `auth.users`; allowlist in `public.app_admins` |
| Session cookie payload (`{role,email,sub}`) | Admin | Server-generated JWT after Supabase Auth exchange | Browser cookie, 8h TTL |
| Failed-session-exchange IPs | Any visitor attempting to use `/api/auth/session` | HTTP request | Same 15-min in-memory sliding window |
| Failed-login IP addresses | Any web visitor attempting to log in | HTTP request | Node process memory, 15 min |
| Confluence account label + tokens | Admin who connects Confluence | Atlassian OAuth flow | Supabase `confluence_connections` (tokens encrypted AES-256-GCM at app layer) |
| Scenario / category / tag / image content | Whoever the admin writes about | Admin input | Supabase `scenarios`, `categories`; images in Supabase Storage bucket `scenario-images` |

**Purposes and legal basis (Art 6):**

- Managing procedures and publishing them to employees — **legitimate interest** (workplace administration).
- Failed-login rate limiting — **legitimate interest** (security, Recital 49).
- Admin sign-in via Supabase Auth (email address, hashed password, optional Google OAuth identity) — **contract / legitimate interest**.
- Confluence integration — **consent** of the connecting admin (Art 6(1)(a)); revoked by clicking Disconnect.

**Recipients / subprocessors:** see §2.

**International transfers:** see §2. Prefer EU regions; otherwise EU SCCs apply
through each subprocessor's DPA.

**Retention:** see the privacy notice; also §3 below.

**Technical & organisational measures (Art 32):** HTTPS + HSTS, JWT-signed
httpOnly cookies with SameSite=Lax, timing-safe password compare, per-IP login
rate limit, magic-byte upload validation, HTML sanitizer on Confluence content,
per-endpoint auth on all mutations, CSP + hardening headers, database & object-
storage encryption at rest, AES-256-GCM for Confluence tokens at application
layer, automated Supabase backups.

---

## 2. Subprocessors

| Processor | Purpose | Region | DPA | Data transferred |
|---|---|---|---|---|
| **Supabase** | Postgres DB + object storage (scenario images) | Pick **eu-central-1 (Frankfurt)** or **eu-west-1 (Ireland)** at project creation | https://supabase.com/legal/dpa | All scenario/category content, admin's Confluence connection row, uploaded images |
| **Render** | Application hosting | Pick **Frankfurt** for the web service | https://render.com/legal/dpa | Server env vars (including admin password and secrets), inbound HTTP requests |
| **Atlassian** (only if Confluence is connected) | Source of Confluence content that admins choose to display | Depends on the admin's Confluence site (Cloud regions vary) | https://www.atlassian.com/legal/data-processing-addendum | OAuth tokens exchanged with `auth.atlassian.com`; API calls to `api.atlassian.com` for the pages the admin explicitly links |
| **Google** (only if you enable Google Sign-In) | OAuth identity provider for admin sign-in | Google servers (US, with EU processing under Google's DPA) | https://cloud.google.com/terms/data-processing-addendum | Admin's email and Google account id at sign-in time; nothing about employees |

There are **no** analytics, advertising, CDN, or third-party font subprocessors.
`index.html` intentionally does not hotlink Google Fonts (a known GDPR issue in
DE case law) — the app uses the system-font stack.

Before production launch:

- [ ] Sign the Supabase DPA (self-service in the Supabase dashboard).
- [ ] Sign the Render DPA (self-service in Render dashboard → account).
- [ ] Sign the Atlassian DPA if Confluence is enabled (via developer.atlassian.com).
- [ ] Sign the Google Cloud DPA if Google Sign-In is enabled.
- [ ] Confirm Supabase project region.
- [ ] Confirm Render service region.
- [ ] Invite your real admin(s) via Manage Admins, then remove `ADMIN_USER` / `ADMIN_PASSWORD` from Render (closes the bootstrap login path).

---

## 3. Retention & deletion

| Data | Retention | Deletion mechanism |
|---|---|---|
| Session cookie | 8 hours (or immediately on logout) | Client cookie expiry / `POST /api/auth/logout` |
| Failed-login IPs | 15 minutes | In-memory sliding window in `server/index.js` |
| Scenarios & categories | Until admin deletes | Admin UI (also cascade-deletes any uploaded images) |
| Uploaded images | Until parent scenario is deleted or the image is replaced | Automatic via `removeStoredImages()` |
| Confluence tokens | Until admin clicks Disconnect | `DELETE /api/confluence/disconnect` |
| Server logs | Whatever Render's default retention is (typically 7 days) | Managed by Render |
| Supabase backups | Per Supabase plan (Free: 7 days; Pro: 30 days point-in-time recovery) | Managed by Supabase |

Data-subject rights (Art 15–20) can be served by:

- **Access & portability:** `GET /api/admin/export` returns a JSON dump of all categories, scenarios, and Confluence connection metadata (no secrets). Provide this to a requester.
- **Rectification & erasure:** admin UI (edit / delete).
- **Objection / restriction:** contact `{{CONTROLLER_EMAIL}}`.

Target response time to a DSAR: **one month** (Art 12(3)).

---

## 4. Breach notification runbook (Art 33 / 34)

**Trigger.** Any of: unauthorised access to Supabase, leaked admin password or
JWT secret, leaked Confluence tokens, or discovery of a code vulnerability
that likely allowed exfiltration.

**T + 0 h — contain.**
1. Rotate `ADMIN_PASSWORD`, `JWT_SECRET`, `SUPABASE_SECRET_KEY`, and
   `CONFLUENCE_ENCRYPTION_KEY` in Render.
2. If Confluence tokens were exposed, revoke them in Atlassian
   (developer.atlassian.com → OAuth 2.0 app → Revoke tokens).
3. If Supabase key was exposed, rotate it in Supabase Project Settings → API.

**T + 4 h — assess.**
- What data categories were affected?
- Approximately how many people?
- Likely consequences (risk to rights and freedoms)?
- Was data encrypted or otherwise protected?

**T + 24 h — decide.**
- If likely to result in risk → prepare Art 33 notification to the supervisory
  authority (identify the lead SA based on `{{CONTROLLER_ADDRESS}}`).
- If likely to result in **high** risk → also prepare Art 34 notification to
  affected data subjects.

**T + 72 h — notify.**
- Submit the Art 33 notification even if some facts are still unknown; the
  regulation permits phased reporting.
- Include: nature of breach, categories & approximate numbers, contact point
  (DPO or `{{CONTROLLER_EMAIL}}`), likely consequences, measures taken.

**Post-incident.**
- Update this runbook with what happened and what was done.
- Log the incident in the internal breach register (Art 33(5)).
- If code was at fault, fix, add a test, ship.

**Supervisory-authority contacts** to fill in for your jurisdiction:

- Lead SA: `{{LEAD_SA_NAME}}`, `{{LEAD_SA_URL}}`
- Backup: national DPA where affected users live.

---

## 5. What is NOT in scope

- Employee tracking — the app has no employee login, no analytics, and no
  tracking cookies. Employees are anonymous readers.
- Automated decision making (Art 22) — none.
- Special-category data (Art 9) — not intended. Admins should not enter
  health, ethnicity, religion, or other special-category data into scenarios.
- Children's data (Art 8) — not intended.

---

## 6. When to update this document

Every time you:

- Add or remove a subprocessor.
- Change retention.
- Add a new personal-data category (e.g. employee logins).
- Change server logging.
- Migrate regions.

Re-run the pentest checklist (see `docs/PENTEST.md` if / when it exists) and
review the privacy notice text in the three locale JSON files.
