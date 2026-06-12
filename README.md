# Outmark Portal

Client portal for Outmark — onboarding, dashboards, documents, requests — plus
an admin backend for Felix.

## Stack
- **Next.js 15** (App Router, TypeScript, server components)
- **Supabase** — Postgres + Auth + Storage. RLS enforces "clients see only their own data"
- **Resend** — transactional email
- **Tailwind** — styling, with tokens lifted from outmark.ca
- **Vercel** — hosting at `portal.outmark.ca`
- **Cal.com** — embedded shoot-day booking

See [DECISIONS.md](./DECISIONS.md) for why each piece was chosen.

## Quick start

### 1. One-time setup

```bash
# Install deps
npm install

# Copy env template
cp .env.example .env.local
# Edit .env.local — fill in Supabase + Resend keys (see below)
```

### 2. Create the Supabase project

1. Go to https://supabase.com → **New project** (free tier)
2. Once provisioned, grab keys from **Project Settings → API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role key` → `SUPABASE_SERVICE_ROLE_KEY` (server-only, never commit)
3. Grab the connection string from **Project Settings → Database → Connection string → URI**
   → `DATABASE_URL`

### 3. Run migrations

```bash
# Either via the Supabase CLI:
npx supabase link --project-ref <your-project-ref>
npx supabase db push

# Or paste each file in supabase/migrations/ into the Supabase SQL editor
# in order: 0001 → 0002 → 0003
```

### 4. Create the first admin user

Supabase doesn't have admins by default — bootstrap one:

1. Visit `http://localhost:3000/login` and sign up via magic link with
   `felix@outmark.ca` (this creates the `auth.users` row but no `public.users` yet)
2. In the Supabase SQL editor:

   ```sql
   insert into public.users (id, role, email, full_name)
   values (
     (select id from auth.users where email = 'felix@outmark.ca'),
     'admin',
     'felix@outmark.ca',
     'Felix Muensterer'
   )
   on conflict (id) do update set role = 'admin';
   ```

3. Sign out and back in. You should now land on `/admin`.

### 5. Seed demo data (optional)

```bash
npm run db:seed
```

This creates a "Demo Brand Co." client with sample metrics, content, requests
so you can demo the client experience. (Requires step 4 first.)

### 6. Run locally

```bash
npm run dev
```

Open http://localhost:3000 — log in as `felix@outmark.ca` to see admin, or
invite a fake client from `/admin/invite` and accept the link in another browser.

## Deployment

### Vercel

```bash
npx vercel link
npx vercel env add NEXT_PUBLIC_SUPABASE_URL
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
npx vercel env add SUPABASE_SERVICE_ROLE_KEY
npx vercel env add RESEND_API_KEY
npx vercel env add RESEND_FROM
npx vercel env add NEXT_PUBLIC_APP_URL
npx vercel env add NEXT_PUBLIC_ADMIN_EMAIL
npx vercel env add NEXT_PUBLIC_CAL_LINK
npx vercel --prod
```

### Custom domain `portal.outmark.ca`

1. In Vercel project: **Settings → Domains → Add `portal.outmark.ca`**
2. Vercel shows a CNAME — add it in your **Hostinger DNS panel**:
   - Type: `CNAME`
   - Name: `portal`
   - Target: `cname.vercel-dns.com`
3. SSL provisions automatically within a few minutes
4. Set `NEXT_PUBLIC_APP_URL=https://portal.outmark.ca` in Vercel env

The marketing site (outmark.ca on Hostinger) is unaffected.

### Supabase auth redirect URLs

In Supabase **Authentication → URL Configuration**, add:
- Site URL: `https://portal.outmark.ca`
- Redirect URLs: `https://portal.outmark.ca/auth/callback`

## Backups

Supabase auto-backs up the DB daily on the free tier (single most recent
snapshot) and 7-day point-in-time recovery on Pro ($25/mo). To restore:

1. Supabase Dashboard → **Database → Backups**
2. Pick a snapshot, click **Restore**

For belt-and-suspenders, run a manual export weekly:
```bash
pg_dump $DATABASE_URL > backup-$(date +%F).sql
```

## Project structure

```
app/
  (auth)/           — login, invite acceptance
  (client)/         — client routes (RLS-gated)
  (admin)/          — admin routes (admin-only)
  onboarding/       — 10-step flow
  api/              — server-side endpoints (invite, notify, export, etc.)
components/         — shared UI
lib/
  supabase-server.ts  — server SSR client + service-role client
  supabase-browser.ts — browser client
  auth.ts             — getCurrentUser / requireUser / requireAdmin / requireClient
  email.ts            — Resend wrapper + templates
  onboarding-config.ts — step list (UI-side, schema doesn't depend on it)
supabase/
  migrations/         — checked-in SQL migrations (additive only)
  seed.sql            — demo data
```

## Data + UI separation

The schema in `supabase/migrations/` is the source of truth. Every UI
component reads from those tables — no client data is ever embedded in
component files. You can rewrite any page's UI without touching the DB.

The "download all my data" button in `/account` exports everything from
the structured tables as JSON, independent of how the UI renders it.

## What's stubbed vs. live

See [STATUS.md](./STATUS.md).

<!-- deploy pipeline verified from new machine on 2026-06-12 -->
