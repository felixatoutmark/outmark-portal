-- ════════════════════════════════════════════════════════════════════════
-- Row Level Security policies
-- ────────────────────────────────────────────────────────────────────────
-- Model:
--   • Every public.* table has RLS enabled.
--   • Two roles, derived from public.users:
--       - admin   → can read/write everything (bypass via SECURITY DEFINER fn)
--       - client  → can only access rows where client_id = their own client_id
--   • admin_notes is admin-only (no client access at all).
-- ════════════════════════════════════════════════════════════════════════

-- Helper functions (SECURITY DEFINER so RLS doesn't recurse on public.users)
create or replace function public.current_role()
returns text language sql security definer stable as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.current_client_id()
returns uuid language sql security definer stable as $$
  select client_id from public.users where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select coalesce((select role = 'admin' from public.users where id = auth.uid()), false);
$$;

grant execute on function public.current_role()      to authenticated;
grant execute on function public.current_client_id() to authenticated;
grant execute on function public.is_admin()          to authenticated;

-- Enable RLS everywhere
alter table public.clients               enable row level security;
alter table public.users                 enable row level security;
alter table public.onboarding_progress   enable row level security;
alter table public.content_preferences   enable row level security;
alter table public.filming_logistics     enable row level security;
alter table public.dashboard_metrics     enable row level security;
alter table public.content_items         enable row level security;
alter table public.deliverables          enable row level security;
alter table public.documents             enable row level security;
alter table public.requests              enable row level security;
alter table public.admin_notes           enable row level security;
alter table public.activity_log          enable row level security;
alter table public.invitations           enable row level security;

-- ── clients ───────────────────────────────────────────────────────────
create policy clients_admin_all on public.clients
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy clients_self_read on public.clients
  for select to authenticated using (id = public.current_client_id());

-- ── users ─────────────────────────────────────────────────────────────
-- Self can always read own row (so the app can determine role on login).
create policy users_self_read on public.users
  for select to authenticated using (id = auth.uid());
create policy users_admin_all on public.users
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── onboarding_progress ──────────────────────────────────────────────
create policy onboarding_admin_all on public.onboarding_progress
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy onboarding_client_rw on public.onboarding_progress
  for all to authenticated
  using (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());

-- ── content_preferences ──────────────────────────────────────────────
create policy content_prefs_admin_all on public.content_preferences
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy content_prefs_client_rw on public.content_preferences
  for all to authenticated
  using (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());

-- ── filming_logistics ────────────────────────────────────────────────
create policy filming_admin_all on public.filming_logistics
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy filming_client_rw on public.filming_logistics
  for all to authenticated
  using (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());

-- ── dashboard_metrics — client read-only, admin write ────────────────
create policy metrics_admin_all on public.dashboard_metrics
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy metrics_client_read on public.dashboard_metrics
  for select to authenticated using (client_id = public.current_client_id());

-- ── content_items — client read-only, admin write ────────────────────
create policy content_items_admin_all on public.content_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy content_items_client_read on public.content_items
  for select to authenticated using (client_id = public.current_client_id());

-- ── deliverables — client read-only ──────────────────────────────────
create policy deliverables_admin_all on public.deliverables
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy deliverables_client_read on public.deliverables
  for select to authenticated using (client_id = public.current_client_id());

-- ── documents — client can read own + insert (uploads); admin all ────
create policy documents_admin_all on public.documents
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy documents_client_read on public.documents
  for select to authenticated using (client_id = public.current_client_id());
create policy documents_client_insert on public.documents
  for insert to authenticated with check (client_id = public.current_client_id());

-- ── requests — client can create + read own; admin can update/respond ─
create policy requests_admin_all on public.requests
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy requests_client_rw on public.requests
  for select to authenticated using (client_id = public.current_client_id());
create policy requests_client_insert on public.requests
  for insert to authenticated with check (client_id = public.current_client_id());

-- ── admin_notes — admin only, NEVER readable by clients ──────────────
create policy admin_notes_admin_only on public.admin_notes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── activity_log — admin all; clients read own ───────────────────────
create policy activity_admin_all on public.activity_log
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy activity_client_read on public.activity_log
  for select to authenticated using (client_id = public.current_client_id());

-- ── invitations — admin only ─────────────────────────────────────────
create policy invitations_admin_all on public.invitations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
