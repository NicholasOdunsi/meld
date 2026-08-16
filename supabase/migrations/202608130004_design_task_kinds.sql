-- Add the two Design Room task kinds. Own migration, before any use: Postgres
-- forbids using a new enum value in the same transaction that adds it.
alter type public.ai_task_kind add value if not exists 'design_profile_distill';
alter type public.ai_task_kind add value if not exists 'design_screen_generate';
