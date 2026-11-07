-- Inspiration auto-sorting (spec: docs/superpowers/specs/2026-11-07-inspiration-auto-sorting-design.md).
-- One label row per ready item. Only the server (service_role) writes, via the
-- RPCs below. The vocabulary checks mirror packages/contracts/src/inspiration-labels.ts
-- -- change both together.

create table public.inspiration_labels (
  item_id uuid primary key references public.inspiration_items(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status text not null default 'unsorted' check (status in ('unsorted', 'sorted', 'unsortable')),
  attempts integer not null default 0 check (attempts >= 0),
  claimed_at timestamptz,
  device text check (device is null or device in ('mobile', 'tablet', 'web', 'desktop_app')),
  screen_type text check (screen_type is null or screen_type in (
    'login', 'signup', 'onboarding', 'home', 'dashboard', 'list', 'detail', 'search',
    'profile', 'settings', 'pricing', 'checkout', 'cart', 'chat', 'editor', 'calendar',
    'map', 'empty_state', 'error', 'landing', 'modal', 'other')),
  patterns text[] not null default '{}' check (
    cardinality(patterns) <= 6 and patterns <@ array[
      'tab_bar', 'sidebar', 'top_nav', 'cards', 'table', 'chart', 'form', 'modal', 'sheet',
      'search_bar', 'filters', 'hero', 'carousel', 'grid', 'list_rows', 'avatar', 'badges',
      'stepper', 'toolbar', 'fab', 'illustration', 'media_player']::text[]),
  theme text check (theme is null or theme in ('light', 'dark')),
  colors text[] not null default '{}' check (
    cardinality(colors) <= 5
    and (cardinality(colors) = 0 or array_to_string(colors, ',') ~ '^#[0-9a-f]{6}(,#[0-9a-f]{6})*$')),
  style_words text[] not null default '{}' check (
    cardinality(style_words) <= 3
    and (cardinality(style_words) = 0 or array_to_string(style_words, ',') ~ '^[a-z][a-z-]{0,19}(,[a-z][a-z-]{0,19})*$')),
  description text check (description is null or char_length(description) between 1 and 400),
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'sorted' or (
    device is not null and screen_type is not null and theme is not null
    and cardinality(colors) >= 1 and description is not null))
);
create index inspiration_labels_unsorted
  on public.inspiration_labels (workspace_id, created_at) where status = 'unsorted';

alter table public.inspiration_labels enable row level security;
revoke all on table public.inspiration_labels from anon, authenticated;
grant select on table public.inspiration_labels to authenticated, service_role;
create policy "Workspace members can view inspiration labels"
on public.inspiration_labels for select to authenticated
using (public.is_workspace_member(workspace_id));

-- An item that becomes ready gets an unsorted label row.
create function public.inspiration_labels_on_ready()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inspiration_labels (item_id, workspace_id)
  values (new.id, new.workspace_id)
  on conflict (item_id) do nothing;
  return new;
end;
$$;
revoke all on function public.inspiration_labels_on_ready() from public, anon, authenticated, service_role;

create trigger inspiration_items_labels_on_ready
after update of status on public.inspiration_items
for each row
when (new.status = 'ready' and old.status is distinct from 'ready')
execute function public.inspiration_labels_on_ready();

-- One-time backfill for items that were already ready.
insert into public.inspiration_labels (item_id, workspace_id)
select id, workspace_id from public.inspiration_items where status = 'ready'
on conflict (item_id) do nothing;

create function public.claim_inspiration_sort(target_workspace_id uuid, batch_limit integer)
returns table (item_id uuid, storage_path text, mime_type text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with picked as (
    select label.item_id
    from public.inspiration_labels as label
    where label.workspace_id = target_workspace_id
      and label.status = 'unsorted'
      and (label.claimed_at is null or label.claimed_at < now() - interval '5 minutes')
    order by label.created_at, label.item_id
    limit least(greatest(coalesce(batch_limit, 10), 1), 10)
    for update skip locked
  ), claimed as (
    update public.inspiration_labels as label
    set claimed_at = now(), attempts = label.attempts + 1, updated_at = now()
    from picked
    where label.item_id = picked.item_id
    returning label.item_id
  )
  select item.id, item.storage_path, item.mime_type
  from claimed
  join public.inspiration_items as item on item.id = claimed.item_id;
end;
$$;

create function public.save_inspiration_labels(target_item_id uuid, item_labels jsonb, labels_model text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.inspiration_labels
  set device = item_labels ->> 'device',
      screen_type = item_labels ->> 'screenType',
      patterns = array(select jsonb_array_elements_text(coalesce(item_labels -> 'patterns', '[]'::jsonb))),
      theme = item_labels ->> 'theme',
      colors = array(select jsonb_array_elements_text(coalesce(item_labels -> 'colors', '[]'::jsonb))),
      style_words = array(select jsonb_array_elements_text(coalesce(item_labels -> 'styleWords', '[]'::jsonb))),
      description = item_labels ->> 'description',
      model = left(labels_model, 100),
      status = 'sorted',
      claimed_at = null,
      updated_at = now()
  where item_id = target_item_id and status = 'unsorted';
  return found;
end;
$$;

create function public.release_inspiration_sort(target_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.inspiration_labels
  set claimed_at = null,
      status = case when attempts >= 3 then 'unsortable' else status end,
      updated_at = now()
  where item_id = target_item_id and status = 'unsorted';
end;
$$;

revoke all on function public.claim_inspiration_sort(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.save_inspiration_labels(uuid, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.release_inspiration_sort(uuid) from public, anon, authenticated, service_role;
grant execute on function public.claim_inspiration_sort(uuid, integer) to service_role;
grant execute on function public.save_inspiration_labels(uuid, jsonb, text) to service_role;
grant execute on function public.release_inspiration_sort(uuid) to service_role;
