-- Add attachments to requests so clients can upload supporting files.
-- Stored as a jsonb array of { path, name, size } objects pointing to the
-- client-files storage bucket.
alter table public.requests
  add column if not exists attachments jsonb not null default '[]'::jsonb;
