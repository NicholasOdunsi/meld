-- `postgres_changes` only streams tables added to the supabase_realtime
-- publication. design-events-subscription.ts (Task 9) subscribes to INSERT on
-- public.design_screen_events the same way subscribeToProductionRoom
-- subscribes to public.messages, but the table was never added to the
-- publication, so live inserts never streamed -- the drawer only populated on
-- open/reconnect. Delivery is still governed by the table's participant-SELECT
-- RLS policy from 202608130008_design_events.sql. Default replica identity is
-- fine since the subscription only reads INSERTs.
alter publication supabase_realtime add table public.design_screen_events;
