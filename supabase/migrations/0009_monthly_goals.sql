-- Per-client monthly goals/KPIs. Replaces the 30/60/90-day target fields
-- previously captured in onboarding. Clients log a row per month with their
-- target, then admin updates current_value + status as the month progresses.
create table if not exists public.monthly_goals (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  month         date not null, -- always first of the month, e.g. 2026-05-01
  kpi_label     text not null,
  target_value  text,
  current_value text,
  status        text not null default 'on_track'
                 check (status in ('on_track','at_risk','achieved','missed')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (client_id, month)
);
create trigger trg_monthly_goals_updated_at before update on public.monthly_goals
  for each row execute function public.set_updated_at();
create index if not exists idx_monthly_goals_client_month on public.monthly_goals(client_id, month desc);

alter table public.monthly_goals enable row level security;
create policy monthly_goals_admin_all on public.monthly_goals
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy monthly_goals_client_read on public.monthly_goals
  for select to authenticated using (client_id = public.current_client_id());
create policy monthly_goals_client_write on public.monthly_goals
  for insert to authenticated with check (client_id = public.current_client_id());
create policy monthly_goals_client_update on public.monthly_goals
  for update to authenticated
  using (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());
