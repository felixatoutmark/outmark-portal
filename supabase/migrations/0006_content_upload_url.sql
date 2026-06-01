-- Per-client link to wherever they should drop raw footage
-- (Frame.io, Dropbox, Google Drive, etc.). Admin-editable; rendered as a
-- big orange "Upload content" button on the client dashboard.
alter table public.clients
  add column if not exists content_upload_url text;
