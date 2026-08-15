-- The user_flow_assist task kind must be committed in its own migration before
-- 202608140002 references it in a partial unique index predicate. PostgreSQL
-- forbids using a newly added enum value in the transaction that adds it, and
-- the Supabase CLI wraps each migration file in one transaction.
alter type public.ai_task_kind add value if not exists 'user_flow_assist';
