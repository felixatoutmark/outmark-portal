-- Free-text "topics to avoid" — captured during onboarding step 5,
-- editable from the client Content Settings page.
alter table public.content_preferences
  add column if not exists topics_to_avoid text;
