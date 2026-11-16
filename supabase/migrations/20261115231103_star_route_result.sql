-- Routing happens before the human message is posted. Its result may only be
-- read by the person who requested the check; no room message is materialized.
alter type public.ai_task_kind add value if not exists 'star_route';
