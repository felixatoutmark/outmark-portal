-- Facebook Page numbers alongside Instagram.
--   organic_reach        stays the number shown on the dashboard — now the
--                        COMBINED Instagram + Facebook reach (manual months:
--                        whatever was typed).
--   ig_reach / fb_reach  the two parts behind a Meta-synced total, kept
--                        separately so one platform failing on a given day
--                        never drops the other from the total.
--   followers_gained     stays Instagram's net new followers;
--   fb_followers_gained  is the Facebook Page's.
alter table public.dashboard_metrics
  add column if not exists ig_reach integer,
  add column if not exists fb_reach integer,
  add column if not exists fb_followers_gained integer;
