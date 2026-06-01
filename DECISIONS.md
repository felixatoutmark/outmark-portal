# DECISIONS.md

Architectural choices made during the V1 build. Anything not listed here
followed the spec verbatim.

## Stack

- **Next.js 15 / App Router / TypeScript** — server components let the
  dashboard render data-driven pages without per-page loading spinners.
  TS catches schema/UI drift early, important when the schema is
  explicitly meant to outlast UI changes.

- **Supabase** — chosen over Firebase/PlanetScale + custom auth because
  RLS at the database layer is a stronger security model than app-layer
  authorization. "Clients see only their own data" is enforced even if a
  route handler has a bug. Single-vendor for DB+auth+storage keeps cost
  near zero at 3 clients.

- **Resend** — modern transactional email API with a free tier that
  covers this volume.

- **Tailwind** — fastest path to mirroring outmark.ca's tokens
  (palette/typography/spacing) cleanly. Tokens live in
  `tailwind.config.ts` + `app/globals.css` — easy to swap.

- **Cal.com inline embed** — official `@calcom/embed-react` package.
  `NEXT_PUBLIC_CAL_LINK` env var defaults to `outmark/shoot-day`; swap
  when the real event type exists.

## Schema

- **Snake_case throughout, plural table names.**
- **Enums implemented as text + check constraints** rather than Postgres
  ENUM types — adding a new value never requires DDL on a live DB.
- **`status`-style fields kept independent of UI**: e.g. `clients.status`
  is `onboarding | active | paused | churned`, not "what tab to show
  this on" — the UI computes display from data.
- **Timestamps**: every mutable table has `created_at` + `updated_at`,
  with a generic `set_updated_at()` trigger function.
- **Onboarding data**: a hybrid model. Each step's data lives in
  `onboarding_progress.data` (jsonb), but the canonical fields ALSO mirror
  into structured tables (`clients`, `content_preferences`,
  `filming_logistics`) so the dashboard can read them with simple SQL.
  This keeps the UI flexible (steps can change order/structure freely)
  while the dashboard contract stays stable.
- **Documents stored as storage paths**, not public URLs. The UI requests
  signed URLs on demand — no permanently public file links, no leakage
  if a URL is shared.
- **Admin notes are admin-only.** RLS policy has *no* read grant for
  clients. Even a SELECT * blanket query as a client returns nothing.

## RLS

- **Three helper functions** (`current_role`, `current_client_id`,
  `is_admin`) are `SECURITY DEFINER` so policies can call them without
  triggering policy recursion when reading `public.users`.
- **Admin policies use `for all` with `is_admin()`**. Client policies use
  `for select/insert/update` scoped to `client_id = current_client_id()`.
- **`dashboard_metrics`, `content_items`, `deliverables`** are read-only
  for clients. Admin writes them. The Spec wants admin-controlled metrics
  in V1 — clients shouldn't be able to invent their own numbers.

## Auth flow

- **Invite-only signup.** No public `/signup`. Admin creates a
  `clients` row + `invitations` row + emails the token link. Client
  hits `/invite/<token>`, sets a password; the API endpoint creates
  the `auth.users` row via service-role, inserts a `public.users` row
  with role='client' and the right `client_id`, marks the invite
  consumed, signs them in.
- **Magic link as backup.** Same `/login` page, toggles between
  password and magic link.
- **Middleware** refreshes the session cookie on every request and
  bounces unauthenticated users to `/login` (preserving `?next=`).

## File uploads

- Bucket: `client-files` (private). Path convention:
  `clients/<client_id>/<category>/<filename>`.
- Storage RLS policies match the same `clients/<id>/*` prefix to the
  authenticated client_id, so a client physically cannot access another
  client's files even with a guessed path.

## Admin notifications

- Onboarding step completion → email admin (per step).
- Content settings changes → email admin, throttled to once per 10 min
  per client (so an admin doesn't get spammed during typing).
- New requests → email admin immediately.

## Out-of-the-box defaults that were NOT fought

- Tailwind preflight reset is left as-is.
- Next.js fetch caching is default (page-level).
- Supabase JWT expiry is default (1h, refresh token 7d).

## Specifically NOT done in V1 (spec calls these out as out-of-scope)

- Live Meta/TikTok API integration — admin pastes numbers in.
- Stripe/payment processor — billing is manual via e-transfer; invoices
  are PDF uploads.
- Inline content review/approval workflow — V1.5.
- Auto-generated monthly recap PDFs — admin uploads.
- Multi-user per client — one user per client account in V1.

## Things to know going forward

- **Adding a new dashboard metric**: add the column to
  `dashboard_metrics`, surface it in the admin Metrics form, render it
  in `app/(client)/dashboard/page.tsx`. No data migration needed for
  existing rows (column will be NULL until backfilled).
- **Adding an onboarding step**: edit `lib/onboarding-config.ts` only —
  no schema change. The new step just stores data in
  `onboarding_progress.data`. If you need it mirrored into a structured
  table, add a branch in `mirrorToStructuredTables()`.
- **Renaming a column**: don't, unless you also write a backfill+drop
  migration AND update everything that reads from it. Adding a new
  column is always safer.
