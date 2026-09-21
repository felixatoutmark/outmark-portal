-- Leads per month. Synced from the ad account's ACTION events — never from a
-- campaign's "results", which is whatever proxy the campaign optimises for
-- (e.g. a Contact event fired on a second page view) and not a real lead.
-- Which action types count as a lead is configurable per client; the default
-- is Meta's standard Lead event (website Pixel "Lead" + on-Facebook forms).
alter table public.dashboard_metrics
  add column if not exists leads integer;
alter table public.meta_connections
  add column if not exists lead_action_types text[] not null default '{lead}';
