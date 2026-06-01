-- ════════════════════════════════════════════════════════════════════════
-- Outmark Portal — initial schema
-- ════════════════════════════════════════════════════════════════════════
-- Design principles (from spec):
--   • Schema is the source of truth and stable. Field names/types outlast UI.
--   • Additive migrations only — never drop/rename without explicit confirmation.
--   • Client data and UI config NEVER mix in the same table.
--   • Per-row access control via RLS (see 0002_rls_policies.sql).
--
-- Naming:
--   • snake_case throughout. Singular table names → plural.
--   • created_at/updated_at on every mutable table; trigger keeps updated_at fresh.
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ─────────────────────────────────────────────────────────────────────────
-- Enums (use plain text + check constraints rather than postgres enums so
-- adding a new value never requires DDL on production)
-- ─────────────────────────────────────────────────────────────────────────

-- Helper: updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- clients — top-level tenant record
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.clients (
  id                       uuid primary key default gen_random_uuid(),
  business_name            text not null,
  primary_contact_name     text,
  billing_email            text,
  billing_address          text,
  gst_number               text,
  website_url              text,
  industry                 text,
  logo_url                 text,
  status                   text not null default 'onboarding'
                            check (status in ('onboarding','active','paused','churned')),
  monthly_fee              numeric(10,2),
  plan_name                text,
  onboarding_completed_at  timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create trigger trg_clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create index if not exists idx_clients_status on public.clients(status);

-- ─────────────────────────────────────────────────────────────────────────
-- users — links Supabase auth.users to a client + role
--   role='admin'  → client_id null, sees everything
--   role='client' → client_id required, sees only own client_id
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  client_id   uuid references public.clients(id) on delete cascade,
  role        text not null check (role in ('client','admin')),
  full_name   text,
  email       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint users_role_client_consistent check (
    (role = 'admin'  and client_id is null) or
    (role = 'client' and client_id is not null)
  )
);
create trigger trg_users_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create index if not exists idx_users_client_id on public.users(client_id);
create index if not exists idx_users_role      on public.users(role);

-- ─────────────────────────────────────────────────────────────────────────
-- onboarding_progress — per-step completion + step-specific data blob
-- One row per (client_id, step_number); upsert on save.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.onboarding_progress (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  step_number   smallint not null check (step_number between 1 and 20),
  completed     boolean not null default false,
  completed_at  timestamptz,
  data          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (client_id, step_number)
);
create trigger trg_onboarding_progress_updated_at before update on public.onboarding_progress
  for each row execute function public.set_updated_at();
create index if not exists idx_onboarding_client on public.onboarding_progress(client_id);

-- ─────────────────────────────────────────────────────────────────────────
-- content_preferences — 1:1 with client
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.content_preferences (
  client_id            uuid primary key references public.clients(id) on delete cascade,
  topics_whitelist     jsonb not null default '[]'::jsonb,  -- [{topic, reasoning}]
  topics_blacklist     jsonb not null default '[]'::jsonb,
  brand_voice_notes    text,
  on_camera_people     jsonb not null default '[]'::jsonb,  -- [{name, pronunciation, role}]
  off_camera_people    jsonb not null default '[]'::jsonb,
  posting_frequency    text,
  approval_mode        text check (approval_mode in ('auto','manual','none')),
  competitors_to_avoid jsonb not null default '[]'::jsonb,
  compliance_notes     text,
  updated_at           timestamptz not null default now()
);
create trigger trg_content_preferences_updated_at before update on public.content_preferences
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- filming_logistics — 1:1 with client
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.filming_logistics (
  client_id          uuid primary key references public.clients(id) on delete cascade,
  primary_address    text,
  best_days_times    text,
  parking_notes      text,
  key_contact_name   text,
  key_contact_phone  text,
  updated_at         timestamptz not null default now()
);
create trigger trg_filming_logistics_updated_at before update on public.filming_logistics
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- dashboard_metrics — admin-entered period snapshots
-- One row per (client_id, period_start, period_end).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dashboard_metrics (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references public.clients(id) on delete cascade,
  period_start          date not null,
  period_end            date not null,
  organic_reach         integer,
  paid_reach            integer,
  profile_visits        integer,
  website_clicks        integer,
  paid_spend            numeric(10,2),
  roas                  numeric(10,2),
  followers_gained      integer,
  manually_entered_by   uuid references auth.users(id),
  entered_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (client_id, period_start, period_end),
  check (period_end >= period_start)
);
create trigger trg_dashboard_metrics_updated_at before update on public.dashboard_metrics
  for each row execute function public.set_updated_at();
create index if not exists idx_metrics_client_period on public.dashboard_metrics(client_id, period_end desc);

-- ─────────────────────────────────────────────────────────────────────────
-- content_items — individual posts/reels/ads
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.content_items (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,
  type            text not null check (type in ('reach_reel','conversion_content','paid_ad')),
  thumbnail_url   text,
  instagram_url   text,
  status          text not null default 'in_production'
                   check (status in ('in_production','scheduled','awaiting_approval','published')),
  views           integer,
  saves           integer,
  shares          integer,
  profile_visits  integer,
  link_clicks     integer,
  posted_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_content_items_updated_at before update on public.content_items
  for each row execute function public.set_updated_at();
create index if not exists idx_content_items_client_status on public.content_items(client_id, status);
create index if not exists idx_content_items_client_type   on public.content_items(client_id, type);
create index if not exists idx_content_items_posted_at     on public.content_items(client_id, posted_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- deliverables — contracted vs delivered counts per period+type
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.deliverables (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.clients(id) on delete cascade,
  period_start       date not null,
  period_end         date not null,
  contracted_count   integer not null default 0,
  delivered_count    integer not null default 0,
  content_type       text not null check (content_type in ('reach_reel','conversion_content','paid_ad')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (client_id, period_start, period_end, content_type)
);
create trigger trg_deliverables_updated_at before update on public.deliverables
  for each row execute function public.set_updated_at();
create index if not exists idx_deliverables_client on public.deliverables(client_id, period_end desc);

-- ─────────────────────────────────────────────────────────────────────────
-- documents — files uploaded to client folder in Supabase Storage
-- file_url stores the storage path (e.g. 'clients/<id>/contracts/abc.pdf'),
-- not a public URL. UI requests a signed URL on demand.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  type          text not null check (type in (
                  'signed_contract','sow','addendum','brand_guidelines',
                  'monthly_recap','invoice','other')),
  file_url      text not null,        -- storage path
  filename      text not null,        -- display name
  size_bytes    bigint,
  uploaded_by   uuid references auth.users(id),
  uploaded_at   timestamptz not null default now()
);
create index if not exists idx_documents_client_type on public.documents(client_id, type);
create index if not exists idx_documents_client_date on public.documents(client_id, uploaded_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- requests — client-submitted requests (revisions, ideas, etc.)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.requests (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  category      text not null check (category in
                  ('revision','new_idea','schedule_change','billing','other')),
  message       text not null,
  status        text not null default 'open'
                  check (status in ('open','in_progress','resolved','closed')),
  admin_response text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_requests_updated_at before update on public.requests
  for each row execute function public.set_updated_at();
create index if not exists idx_requests_client_status on public.requests(client_id, status);

-- ─────────────────────────────────────────────────────────────────────────
-- admin_notes — admin-only, NEVER visible to client (RLS enforces)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.admin_notes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  note        text not null,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_admin_notes_updated_at before update on public.admin_notes
  for each row execute function public.set_updated_at();
create index if not exists idx_admin_notes_client on public.admin_notes(client_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- activity_log — append-only audit trail
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.activity_log (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid references public.clients(id) on delete cascade,
  actor_id     uuid references auth.users(id),
  event_type   text not null,
  description  text,
  metadata     jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_activity_client_date on public.activity_log(client_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- invitations — pending client invites (email + token before account exists)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.invitations (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  email        text not null,
  token        text not null unique,
  invited_by   uuid references auth.users(id),
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_invitations_token on public.invitations(token);
create index if not exists idx_invitations_email on public.invitations(email);
