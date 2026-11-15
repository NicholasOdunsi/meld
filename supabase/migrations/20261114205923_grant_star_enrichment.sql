-- The post-response title/group suggestion uses the server-only service client.
-- RLS still governs all browser actions through the authenticated role.
grant select, insert, update on public.room_constellations to service_role;
grant select, update on public.room_stars to service_role;
