-- Track contracted vs used shoot days per client.
-- Admin edits both numbers; dashboard shows them as "used / total".
alter table public.clients
  add column if not exists shoot_days_total integer not null default 0,
  add column if not exists shoot_days_used  integer not null default 0;
