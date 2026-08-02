-- "Top performing ad" — one per client per month, shown next to the top 3
-- winning reels on the client dashboard. The media is an admin-uploaded photo
-- or video (no link scraping), stored in the public `thumbnails` bucket and
-- uploaded straight from the admin's browser (Vercel routes cap bodies at
-- ~4.5 MB, far too small for ad videos).
create table if not exists public.top_ad (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  month        date not null, -- always first of the month
  media_url    text not null,
  media_type   text not null check (media_type in ('image','video')),
  title        text,
  metric_label text, -- e.g. "3.2x ROAS · $1.2k spend"
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (client_id, month)
);
create trigger trg_top_ad_updated_at before update on public.top_ad
  for each row execute function public.set_updated_at();
create index if not exists idx_top_ad_client_month on public.top_ad(client_id, month desc);

alter table public.top_ad enable row level security;

create policy top_ad_admin_all on public.top_ad
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy top_ad_client_read on public.top_ad
  for select to authenticated using (client_id = public.current_client_id());

-- Let the signed-in admin write to the thumbnails bucket from the browser
-- (until now only the service role wrote there).
create policy "thumbnails admin all"
  on storage.objects for all to authenticated
  using (bucket_id = 'thumbnails' and public.is_admin())
  with check (bucket_id = 'thumbnails' and public.is_admin());
