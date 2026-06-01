-- ════════════════════════════════════════════════════════════════════════
-- Storage buckets + RLS for files
-- Path convention: clients/<client_id>/<category>/<filename>
-- ════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('client-files', 'client-files', false)
on conflict (id) do nothing;

-- Admin can do anything in client-files
create policy "client-files admin all"
  on storage.objects for all to authenticated
  using (bucket_id = 'client-files' and public.is_admin())
  with check (bucket_id = 'client-files' and public.is_admin());

-- Clients can read/write only inside their own clients/<their_id>/* path
create policy "client-files client read own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'client-files'
    and (storage.foldername(name))[1] = 'clients'
    and (storage.foldername(name))[2] = public.current_client_id()::text
  );

create policy "client-files client insert own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'client-files'
    and (storage.foldername(name))[1] = 'clients'
    and (storage.foldername(name))[2] = public.current_client_id()::text
  );

create policy "client-files client update own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'client-files'
    and (storage.foldername(name))[1] = 'clients'
    and (storage.foldername(name))[2] = public.current_client_id()::text
  );
