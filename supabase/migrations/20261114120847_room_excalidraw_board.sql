-- One revisioned Excalidraw scene per room. Generated screen HTML stays in
-- this document until the production screen migration is designed.
create table public.room_excalidraw_boards (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  document jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  constraint room_excalidraw_boards_document_size check (octet_length(document::text) <= 4000000)
);

alter table public.room_excalidraw_boards enable row level security;
revoke all on public.room_excalidraw_boards from anon, authenticated;
grant select on public.room_excalidraw_boards to authenticated;
create policy "Participants can view room boards"
on public.room_excalidraw_boards for select to authenticated
using (public.is_room_participant(room_id));

create function public.save_room_excalidraw_board(
  target_room_id uuid,
  expected_revision bigint,
  next_document jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  written_revision bigint;
  current_revision bigint;
begin
  if auth.uid() is null or not public.can_edit_room(target_room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if expected_revision < 0 or next_document is null
    or octet_length(next_document::text) > 4000000
    or next_document->>'version' is distinct from '1'
    or jsonb_typeof(next_document->'elements') is distinct from 'array'
    or jsonb_typeof(next_document->'screens') is distinct from 'array' then
    raise exception 'invalid_board' using errcode = '22023';
  end if;

  -- A client that claims a prior revision may not create a missing board.
  -- Keep this separate from the upsert so the first-write race is handled by
  -- ON CONFLICT and the expected revision condition below.
  if expected_revision > 0 and not exists (
    select 1 from public.room_excalidraw_boards where room_id = target_room_id
  ) then
    return jsonb_build_object('status', 'conflict', 'revision', 0);
  end if;

  insert into public.room_excalidraw_boards (room_id, revision, document, updated_by)
  values (target_room_id, 1, next_document, auth.uid())
  on conflict (room_id) do update
    set revision = public.room_excalidraw_boards.revision + 1,
        document = excluded.document,
        updated_at = now(),
        updated_by = excluded.updated_by
    where public.room_excalidraw_boards.revision = expected_revision
  returning revision into written_revision;

  if written_revision is not null then
    return jsonb_build_object('status', 'saved', 'revision', written_revision);
  end if;
  select revision into current_revision from public.room_excalidraw_boards where room_id = target_room_id;
  return jsonb_build_object('status', 'conflict', 'revision', current_revision);
end;
$$;

revoke all on function public.save_room_excalidraw_board(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.save_room_excalidraw_board(uuid, bigint, jsonb) to authenticated;
