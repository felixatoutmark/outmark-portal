-- Top 3 winning reels per client per month. Admin pastes the link (plus
-- optional title / metric label); the server resolves a thumbnail at save
-- time and stores it so the client dashboard can render clickable cards.
create table if not exists public.winning_content (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  month         date not null, -- always first of the month, e.g. 2026-08-01
  position      smallint not null check (position between 1 and 3),
  url           text not null,
  thumbnail_url text,
  title         text,
  metric_label  text, -- e.g. "182k views · 4.1k saves"
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (client_id, month, position)
);
create trigger trg_winning_content_updated_at before update on public.winning_content
  for each row execute function public.set_updated_at();
create index if not exists idx_winning_content_client_month on public.winning_content(client_id, month desc);

alter table public.winning_content enable row level security;

create policy winning_content_admin_all on public.winning_content
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy winning_content_client_read on public.winning_content
  for select to authenticated using (client_id = public.current_client_id());

-- Public bucket for cached reel thumbnails. IG/TikTok CDN image URLs are
-- signed and expire within days, so the server downloads the image once at
-- save time and serves it from here instead. Written only via the service
-- role (admin API route); objects are public-read by bucket setting.
insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', true)
on conflict (id) do update set public = true;
