-- Semantic screen key: screens name themselves with a per-room-unique,
-- human-readable key (e.g. "checkout" or "cart-empty"). Later work resolves
-- navigation targets by this key instead of by opaque screen id. The column
-- is nullable for legacy rows and screens that haven't been keyed yet, and
-- the uniqueness index is partial so a soft-deleted screen frees its key.

alter table public.design_screens add column screen_key text
  check (screen_key is null or screen_key ~ '^[a-z][a-z0-9_-]{0,63}$');

create unique index design_screens_room_key_unique
  on public.design_screens (room_id, screen_key)
  where deleted_at is null and screen_key is not null;
