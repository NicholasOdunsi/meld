-- A new AI task kind for building design system components.
--
-- This value is added alone, before any tables or functions that use it,
-- because PostgreSQL does not permit an enum value to be USED in the same
-- transaction that adds it. Task 6 references this value.

alter type public.ai_task_kind add value if not exists 'design_component_build';
