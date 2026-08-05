# QM Playbook

A quality-management procedure playbook for teams that need clear, searchable answers to recurring situations.

Employees open the app, find the scenario that matches what they’re dealing with, and follow the documented solution. Admins own the content — categories, procedures, publish state.

---

### Who it’s for

| Role | What they get |
|------|----------------|
| **Employees** | Browse published scenarios by category, search by title/tags/text, open a procedure and follow it |
| **Admins** | Sign in, manage categories, draft or publish scenarios, keep the playbook current |



---

### What it looks like in practice

1. Admin creates categories that match how the team thinks (e.g. billing, access, escalation).
2. Admin adds scenarios — situation, solution, tags — and marks them **Published** when ready.
3. Employees use **Employee Access** to search and open procedures. Drafts stay admin-only.

---

### How it’s built

Single app, two surfaces (employee + admin), one API.

```
Browser  →  Express (React SPA + /api)  →  Supabase Postgres
```

- **Frontend** — React + Vite
- **Backend** — Express on the same origin (SPA + API together)
- **Data** — Supabase Postgres in production; optional local file store for quick dev
- **Auth** — Shared admin password for demo purposes; session in an httpOnly cookie (not `sessionStorage`)

Designed to run as **one Render web service**. Data persists in Supabase across deploys.

---
