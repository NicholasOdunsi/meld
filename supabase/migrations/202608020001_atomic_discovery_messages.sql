-- Persist a human message, its mentions, and its staged attachments as one
-- transaction. Realtime publishes the INSERT only after the attachment links
-- commit, and an attachment-only message can never survive a link failure as a
-- blank row.
create function public.post_discovery_message(
  target_room_id uuid,
  target_client_id uuid,
  target_body text,
  target_mentioned_user_ids uuid[],
  target_attachment_ids uuid[]
)
returns setof public.messages
language plpgsql
security invoker
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  posted public.messages%rowtype;
  attachment_ids uuid[] := coalesce(target_attachment_ids, '{}'::uuid[]);
  mentioned_user_ids uuid[] := coalesce(target_mentioned_user_ids, '{}'::uuid[]);
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if target_body is null
    or char_length(btrim(target_body)) > 20000
    or cardinality(attachment_ids) > 10
    or cardinality(mentioned_user_ids) > 20
    or (char_length(btrim(target_body)) = 0 and cardinality(attachment_ids) = 0)
  then
    raise exception 'Invalid discovery message' using errcode = '22023';
  end if;

  insert into public.messages (room_id, client_id, author_id, body)
  values (target_room_id, target_client_id, caller_id, btrim(target_body))
  on conflict (room_id, client_id) do nothing
  returning * into posted;

  -- A lost HTTP response may retry the same client id. Return the transaction
  -- that already committed rather than attempting to link its attachments a
  -- second time. A collision with another author fails closed.
  if posted.id is null then
    select message.*
    into posted
    from public.messages as message
    where message.room_id = target_room_id
      and message.client_id = target_client_id
      and message.author_id = caller_id;

    if posted.id is null then
      raise exception 'Invalid discovery message' using errcode = 'P0001';
    end if;

    return next posted;
    return;
  end if;

  if cardinality(mentioned_user_ids) > 0 then
    insert into public.mentions (
      room_id,
      message_id,
      mentioned_user_id,
      created_by
    )
    select
      target_room_id,
      posted.id,
      mentioned.mentioned_user_id,
      caller_id
    from (
      select distinct unnest(mentioned_user_ids) as mentioned_user_id
    ) as mentioned
    on conflict (message_id, mentioned_user_id) do nothing;
  end if;

  if cardinality(attachment_ids) > 0 then
    perform attachment_id
    from public.link_staged_discovery_attachments(
      target_room_id,
      posted.id,
      attachment_ids,
      target_body
    );
  end if;

  return next posted;
end;
$$;

revoke all on function public.post_discovery_message(
  uuid, uuid, text, uuid[], uuid[]
) from public;
grant execute on function public.post_discovery_message(
  uuid, uuid, text, uuid[], uuid[]
) to authenticated;
