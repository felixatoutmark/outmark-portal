-- Demo seed — one test client + sample data so Felix can demo end-to-end.
-- Run AFTER creating an admin auth user via Supabase dashboard, then update
-- the ADMIN_USER_ID below before running.

-- TODO:BLOCKED — needs an actual auth.users row before this can run.
-- Steps Felix takes once Supabase project exists:
--   1. Sign up at portal.outmark.ca/login as felix@outmark.ca
--   2. In Supabase SQL editor: select id from auth.users where email='felix@outmark.ca';
--   3. Replace :admin_id below and run this file.

-- \set admin_id 'PASTE-AUTH-USER-UUID-HERE'

do $$
declare
  v_admin_id uuid;
  v_client_id uuid;
  v_period_start date := date_trunc('month', current_date)::date;
  v_period_end   date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
begin
  -- Pick the first existing admin auth user, or skip seeding if none.
  select id into v_admin_id from auth.users limit 1;
  if v_admin_id is null then
    raise notice 'No auth users yet — sign up as admin first, then re-run seed.sql';
    return;
  end if;

  -- Make sure the admin row exists in public.users
  insert into public.users (id, role, email, full_name)
  values (v_admin_id, 'admin', (select email from auth.users where id = v_admin_id), 'Felix Muensterer')
  on conflict (id) do update set role = 'admin';

  -- Demo client
  insert into public.clients (
    business_name, primary_contact_name, billing_email, industry,
    status, monthly_fee, plan_name, website_url
  )
  values (
    'Demo Brand Co.', 'Sample Owner', 'demo@example.com', 'Outdoor / Lifestyle',
    'active', 3500.00, 'Standard', 'https://example.com'
  )
  returning id into v_client_id;

  insert into public.content_preferences (client_id, brand_voice_notes, posting_frequency, approval_mode)
  values (v_client_id, 'Confident, plain-spoken, no marketing fluff.', '12 reels / month', 'manual');

  insert into public.filming_logistics (client_id, primary_address, best_days_times, key_contact_name)
  values (v_client_id, '123 Sample St, Collingwood ON', 'Tue/Thu 10am–4pm', 'Sample Owner');

  insert into public.dashboard_metrics (
    client_id, period_start, period_end,
    organic_reach, paid_reach, profile_visits, website_clicks,
    paid_spend, roas, followers_gained, manually_entered_by
  )
  values (
    v_client_id, v_period_start, v_period_end,
    420000, 0, 4200, 312, 0, 0, 850, v_admin_id
  );

  insert into public.content_items (client_id, type, status, views, saves, shares, posted_at)
  values
    (v_client_id, 'reach_reel', 'published', 290000, 1820, 410, now() - interval '5 days'),
    (v_client_id, 'reach_reel', 'published',  60000,  430,  90, now() - interval '8 days'),
    (v_client_id, 'reach_reel', 'published',  44000,  280,  55, now() - interval '12 days'),
    (v_client_id, 'conversion_content', 'published', 12000, 90, 14, now() - interval '6 days'),
    (v_client_id, 'reach_reel', 'awaiting_approval', null, null, null, null),
    (v_client_id, 'reach_reel', 'in_production', null, null, null, null);

  insert into public.deliverables (client_id, period_start, period_end, contracted_count, delivered_count, content_type)
  values
    (v_client_id, v_period_start, v_period_end, 12, 8, 'reach_reel'),
    (v_client_id, v_period_start, v_period_end,  2, 1, 'conversion_content');

  insert into public.requests (client_id, category, message, status)
  values (v_client_id, 'new_idea', 'Could we shoot a behind-the-scenes Reel of next week''s setup?', 'open');

  insert into public.admin_notes (client_id, note, created_by)
  values (v_client_id, 'Likes raw / unedited B-roll cuts. Avoid slow-motion intros.', v_admin_id);

  insert into public.activity_log (client_id, actor_id, event_type, description)
  values (v_client_id, v_admin_id, 'demo_seeded', 'Initial demo data inserted via seed.sql');

  raise notice 'Demo client created with id %', v_client_id;
end $$;
