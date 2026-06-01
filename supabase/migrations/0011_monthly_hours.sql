-- Per-client monthly hours delivered. One row per (client, calendar month).
-- Default target is 12 hours; admin updates hours_delivered as work happens.
-- A fresh month gets a new row starting at 0, so the tracker resets every month.
create table if not exists public.monthly_hours (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,
  month           date not null, -- always first of the month, e.g. 2026-04-01
  hours_delivered numeric(5,2) not null default 0,
  hours_target    numeric(5,2) not null default 12,
  updated_at      timestamptz not null default now(),
  unique (client_id, month)
);
create trigger trg_monthly_hours_updated_at before update on public.monthly_hours
  for each row execute function public.set_updated_at();
create index if not exists idx_monthly_hours_client_month on public.monthly_hours(client_id, month desc);

alter table public.monthly_hours enable row level security;

create policy monthly_hours_admin_all on public.monthly_hours
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy monthly_hours_client_read on public.monthly_hours
  for select to authenticated using (client_id = public.current_client_id());
