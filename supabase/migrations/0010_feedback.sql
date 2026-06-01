-- Client feedback: a happiness check-in (mood_score 1-5) plus optional note.
-- Clients can leave standalone notes (mood_score null) or just a mood with
-- no note. Admin reads everything to gauge satisfaction over time.
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  mood_score  smallint check (mood_score between 1 and 5),
  message     text,
  created_at  timestamptz not null default now(),
  check (mood_score is not null or (message is not null and length(trim(message)) > 0))
);
create index if not exists idx_feedback_client_created on public.feedback(client_id, created_at desc);

alter table public.feedback enable row level security;

create policy feedback_admin_all on public.feedback
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy feedback_client_read on public.feedback
  for select to authenticated using (client_id = public.current_client_id());

create policy feedback_client_insert on public.feedback
  for insert to authenticated with check (client_id = public.current_client_id());
