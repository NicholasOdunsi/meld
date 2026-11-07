-- Taste refresh (and any other service job that joins labels → items) needs to
-- read inspiration_items. The original inspiration migration granted SELECT only
-- to authenticated; labels already grant service_role.
grant select on table public.inspiration_items to service_role;
