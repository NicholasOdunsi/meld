-- Commit the enum value before later migrations use it in indexes, functions,
-- and test fixtures. PostgreSQL forbids using a newly-added enum value in the
-- same transaction that adds it.
alter type public.ai_task_kind add value if not exists 'user_flow_generate';
