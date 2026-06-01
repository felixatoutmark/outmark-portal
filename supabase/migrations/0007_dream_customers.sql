-- "Describe your dream customers" — free-form text captured during onboarding
-- step 5 and editable from the Content Settings page afterwards.
alter table public.content_preferences
  add column if not exists dream_customers text;
