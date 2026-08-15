-- Task 9 (semantic-key prototype linking): retire the manual canvas-arrow
-- override machinery. Superseded by keyed navigation (design_screens.screen_key
-- + targetScreenKey, 202608150002), which resolves every action's target
-- without a user drawing a manual override. Drops the override table and its
-- two RPCs; nothing else references them.

drop function if exists public.set_design_screen_action_link(uuid, text, uuid);
drop function if exists public.clear_design_screen_action_link(uuid, text);
drop table if exists public.design_screen_action_links cascade;
