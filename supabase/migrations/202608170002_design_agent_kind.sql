-- Register the Design Agent as an agent kind, matching the TypeScript
-- AgentKindSchema ("product", "research", "design"). Own migration, before any
-- use: Postgres forbids using a new enum value in the same transaction that
-- adds it.
alter type public.ai_agent_kind add value if not exists 'design';
