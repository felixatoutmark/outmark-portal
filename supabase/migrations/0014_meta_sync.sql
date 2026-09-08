-- Meta Graph API sync. One connection row per client mapping it to an
-- Instagram professional account (+ optional ad account) that the agency's
-- Business Manager can access via a System User token. A daily cron pulls
-- account insights, the month's top reels and paid-ad numbers into the
-- existing tables. Rows written by the sync carry source = 'meta'; rows the
-- admin edits by hand are 'manual' and the sync never overwrites them.
create table if not exists public.meta_connections (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null unique references public.clients(id) on delete cascade,
  ig_user_id       text not null,   -- Instagram professional account id (17841…)
  ig_username      text,
  page_id          text,            -- linked Facebook Page (informational)
  ad_account_id    text,            -- numeric, without the act_ prefix; null = no paid data
  sync_enabled     boolean not null default true,
  last_synced_at   timestamptz,
  last_sync_error  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger trg_meta_connections_updated_at before update on public.meta_connections
  for each row execute function public.set_updated_at();

alter table public.meta_connections enable row level security;
create policy meta_connections_admin_all on public.meta_connections
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Admin-only: last_sync_error carries raw Graph/Postgres diagnostics, and the
-- client dashboard reads dashboard_metrics.source instead.

-- Provenance flags on the tables the sync writes.
alter table public.dashboard_metrics
  add column if not exists source text not null default 'manual'
  check (source in ('manual','meta'));
alter table public.winning_content
  add column if not exists source text not null default 'manual'
  check (source in ('manual','meta'));
