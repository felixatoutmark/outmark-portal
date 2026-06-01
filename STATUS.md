# STATUS

Snapshot at end of overnight scaffold. Read this top-to-bottom to get caught up.

> **Build verified.** `npx next build` runs clean — TypeScript, Next.js compile,
> and static page generation all succeed. ~3,000 LOC across 50+ files.
> The scaffold is ready to deploy as soon as Supabase + Resend env vars are set.

## ✅ Built and working (assuming env vars wired up)

### Foundation
- [x] Next.js 15 + TS + Tailwind project structure
- [x] Tokens lifted from outmark.ca (`tailwind.config.ts`, `app/globals.css`)
- [x] Supabase server + browser + service-role clients (`lib/supabase-*.ts`)
- [x] Auth helpers (`lib/auth.ts`) — `getCurrentUser`, `requireUser`, `requireAdmin`, `requireClient`
- [x] Middleware that refreshes Supabase session cookies + gates protected routes
- [x] Resend email wrapper + invite + admin-notification templates

### Schema (the source of truth)
- [x] `supabase/migrations/0001_initial_schema.sql` — all 13 tables: clients, users, onboarding_progress, content_preferences, filming_logistics, dashboard_metrics, content_items, deliverables, documents, requests, admin_notes, activity_log, invitations
- [x] `supabase/migrations/0002_rls_policies.sql` — RLS enabled on every table; admin/client policies; SECURITY DEFINER helper fns
- [x] `supabase/migrations/0003_storage.sql` — `client-files` bucket + path-based RLS so clients can only touch `clients/<their_id>/*`
- [x] `supabase/seed.sql` — demo client + sample metrics, content, deliverables, requests, notes (idempotent; runs once an admin user exists)

### Auth + invite flow
- [x] `/login` — email+password OR magic link, toggles between modes
- [x] `/auth/callback` — magic-link / email-confirmation handler
- [x] `/invite/[token]` — invite acceptance UI
- [x] `/api/invite/accept` — server-side invite consumption: creates auth user, inserts `users` row with role+client_id, marks invitation used, signs them in
- [x] `/api/admin/invite` — admin creates client + invitation + emails link (Resend)

### Onboarding flow (10 steps with auto-save)
- [x] `/onboarding` → redirects to first incomplete step
- [x] `/onboarding/[step]` — every step renders from `lib/onboarding-config.ts`
- [x] 600 ms debounced auto-save on every change → upserts `onboarding_progress`
- [x] Mirrors structured fields into `clients` / `content_preferences` / `filming_logistics` so the dashboard can read without parsing jsonb
- [x] Step 7 has Cal.com inline embed for shoot-day booking
- [x] Steps 3 & 4 have Loom-placeholder boxes (TODO:BLOCKED — record videos)
- [x] Step 10 finalizes onboarding → `/api/onboarding/complete` flips client to `active`
- [x] Every step completion fires `/api/onboarding/notify-admin` → email Felix

### Client dashboard `/dashboard`
- [x] Top stat strip (organic/paid reach, profile visits, website clicks, followers gained, paid spend, ROAS)
- [x] Period-over-period delta % vs prior 30 days
- [x] Top 5 Reach Reels + Top 5 Conversion content (thumbnails, views, saves, shares, IG link)
- [x] Paid ads section — only renders when `paid_spend > 0`
- [x] Content pipeline (in_production / scheduled / awaiting_approval)
- [x] Monthly deliverables progress bars
- [x] Friendly empty states throughout
- [x] Forces redirect to `/onboarding` if `onboarding_completed_at` is null

### Other client pages
- [x] `/content-settings` — edit content_preferences + filming_logistics with auto-save, plus Cal.com re-embed for booking additional shoot days. Fires `/api/content-settings/notify-admin` (10-min throttle).
- [x] `/documents` — grouped by type, signed-URL downloads
- [x] `/billing` — current plan summary + invoice list (PDFs from documents.type='invoice')
- [x] `/requests` — submit form + history with admin replies
- [x] `/account` — profile edit, password change, "download all my data" JSON export

### Admin backend
- [x] `/admin` — client list with status, plan, open-request count, link to detail
- [x] `/admin/invite` — invite form
- [x] `/admin/onboarding` — cross-client tracker showing each client's step completion bar
- [x] `/admin/clients/[id]` — full impersonation-style view with tabs:
  - Overview (client info, onboarding progress, prefs/logistics summary)
  - Metrics (form to add/update period; table of past periods)
  - Content (form to add content_items; status dropdown to update)
  - Deliverables (form to upsert contracted/delivered counts)
  - Documents (drag-and-drop upload, type select)
  - Requests (read + reply with status change)
  - Settings (edit client fields)
  - Notes (admin-only, never visible to client)
  - Activity (audit log)

### Other endpoints
- [x] `/api/account/export` — full client-data JSON dump (independent of UI)
- [x] `/api/onboarding/notify-admin`, `/api/onboarding/complete`
- [x] `/api/content-settings/notify-admin` (throttled)
- [x] `/api/requests/notify-admin`

## 🟡 Stubbed but functional

- **Loom walkthroughs in onboarding steps 3 & 4** — placeholder boxes
  saying "TODO:BLOCKED — record videos and paste embed URLs". Records
  whichever Loom URLs Felix provides; just paste them into the
  components.
- **Test client seed** — `supabase/seed.sql` only runs once an admin
  user exists (it picks up the first `auth.users` row). Documented in
  the README.

## 🔴 Blocked (need Felix in the morning)

1. **Supabase project doesn't exist yet** — sign up, create project,
   paste keys into `.env.local` and Vercel env. Then run the migrations
   (3 files in order). README has the exact steps.
2. **Resend API key + verified sender domain** — sign up at
   resend.com, add `outmark.ca` as a sender domain (DNS records:
   3 TXT entries), grab the API key, set `RESEND_API_KEY` and
   `RESEND_FROM` env vars.
3. **Cal.com event type** — set `NEXT_PUBLIC_CAL_LINK` to the real
   event slug (currently defaults to `outmark/shoot-day` placeholder).
4. **DNS for portal.outmark.ca** — one CNAME record at Hostinger:
   `portal CNAME cname.vercel-dns.com`. Vercel auto-issues SSL.
5. **First admin bootstrap** — README step 4. After signing up via
   the live login page, run one SQL `insert ... role='admin'` to
   promote yourself.
6. **Loom recordings** for onboarding steps 3 & 4 (Meta access, TikTok
   access).

## 🟠 Not built (deferred per spec)

- Live Meta/TikTok API integration (V2)
- Stripe / payment processor (manual e-transfer per spec)
- Inline content approval (V1.5)
- Auto-generated monthly recap PDFs (admin uploads instead)
- Multi-user per client / team accounts (V2)
- White-labeling

## What to do next (in this order)

1. **Make Supabase project + run migrations + bootstrap admin.** ~20 min.
   Once you can log in at `localhost:3000/login` and land on `/admin`,
   the rest mostly just works.
2. **Verify the invite flow end-to-end**: at `/admin/invite`, invite
   a fake client to your personal email; click the invite link in a
   private window; set a password; complete onboarding; check that
   you land on `/dashboard`.
3. **Run `npm run db:seed`** to populate Demo Brand Co. so you can
   see the dashboard with real numbers.
4. **Deploy to Vercel.** ~10 min. README has the exact commands.
   Add the DNS record. Test that `portal.outmark.ca` works.
5. **Record Loom walkthroughs** for Meta + TikTok access steps; paste
   the embed URLs into the placeholders.
6. **Invite first real client** — Salomon test? Or a friendly small
   client first.

## Quick-fix gotchas you might hit

- **"Cannot read role of undefined"** on first login → you forgot
  step 4 (insert into public.users). The page will just bounce you to
  `/login` if your auth row doesn't have a matching public.users row.
- **Vercel build fails because `next` is missing** → run
  `npm install` locally first to commit `package-lock.json`.
- **Cal embed shows "event not found"** → set `NEXT_PUBLIC_CAL_LINK`
  to the real slug (or create the `outmark/shoot-day` event in Cal.com).
- **Emails don't send in dev** → that's expected if `RESEND_API_KEY`
  is unset. The wrapper logs a warning and returns `{ skipped: true }`
  so the rest of the flow still works.

## Files touched

```
outmark-portal/
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── middleware.ts
├── .env.example
├── .gitignore
├── README.md
├── DECISIONS.md
├── STATUS.md  ← you are here
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx
│   ├── (auth)/
│   │   ├── layout.tsx
│   │   ├── login/page.tsx
│   │   └── invite/[token]/{page.tsx, AcceptInviteForm.tsx}
│   ├── auth/callback/route.ts
│   ├── onboarding/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── [step]/{page.tsx, OnboardingStepClient.tsx}
│   ├── (client)/
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── content-settings/{page.tsx, ContentSettingsForm.tsx}
│   │   ├── documents/{page.tsx, DownloadLink.tsx}
│   │   ├── billing/page.tsx
│   │   ├── requests/{page.tsx, RequestForm.tsx}
│   │   └── account/{page.tsx, AccountForm.tsx}
│   ├── (admin)/
│   │   ├── layout.tsx
│   │   └── admin/
│   │       ├── page.tsx          (client list)
│   │       ├── invite/page.tsx
│   │       ├── onboarding/page.tsx
│   │       └── clients/[id]/{page.tsx, AdminClientPanels.tsx}
│   └── api/
│       ├── invite/accept/route.ts
│       ├── admin/invite/route.ts
│       ├── onboarding/{notify-admin, complete}/route.ts
│       ├── content-settings/notify-admin/route.ts
│       ├── requests/notify-admin/route.ts
│       └── account/export/route.ts
├── components/
│   └── Nav.tsx
├── lib/
│   ├── supabase-server.ts
│   ├── supabase-browser.ts
│   ├── auth.ts
│   ├── email.ts
│   └── onboarding-config.ts
└── supabase/
    ├── seed.sql
    └── migrations/
        ├── 0001_initial_schema.sql
        ├── 0002_rls_policies.sql
        └── 0003_storage.sql
```

## Trust-but-verify checklist

Before going live, confirm:

- [ ] Migrations ran successfully (Supabase Dashboard → Database → Tables shows all 13)
- [ ] RLS is **on** for every table (Dashboard → Authentication → Policies — green shield on each)
- [ ] You can log in as admin and reach `/admin`
- [ ] You can invite a fake client → accept → onboard → reach `/dashboard`
- [ ] Logged in as that fake client, querying `from('admin_notes').select('*')` returns nothing
- [ ] Logged in as that fake client, `from('clients').select('*')` returns only own row
- [ ] File upload as admin works (`/admin/clients/<id>` → Documents tab)
- [ ] File download as client works (`/documents` → Download)
- [ ] Storage path traversal blocked: as client, try uploading to `clients/<other-id>/...` via the client lib — should 403
- [ ] `/api/account/export` returns a populated JSON file
