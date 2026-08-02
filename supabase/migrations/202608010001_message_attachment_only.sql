-- Attachment-only messages: a user can share a file with no accompanying text.
-- Two constraints previously forced a non-empty body, so both are relaxed here.

-- 1. The message body may now be empty (an attachment carries the message).
--    The upper bound and the not-null column stay; only the lower bound of 1
--    is dropped. "Body or attachment" is enforced above the database, in the
--    postMessage action, since attachments live in a separate table.
alter table public.messages
  drop constraint messages_body_check,
  add constraint messages_body_check
    check (char_length(btrim(body)) <= 20000);

-- 2. Linking must not blank an image's caption when the message has no body.
--    Images still require a caption (the attachments check), so when the final
--    caption is empty the staged caption (defaulted to the file name at upload)
--    is preserved instead of being overwritten with an empty string.
create or replace function public.link_staged_discovery_attachments(
  target_room_id uuid,
  target_message_id uuid,
  target_attachment_ids uuid[],
  final_caption text
)
returns table (attachment_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  requested_count integer;
  linked_count integer;
begin
  select count(distinct requested.attachment_id)::integer
  into requested_count
  from unnest(target_attachment_ids) as requested(attachment_id);

  return query
  update public.attachments as attachment
  set
    message_id = target_message_id,
    caption = case
      when attachment.mime_type like 'image/%'
        then coalesce(nullif(btrim(final_caption), ''), attachment.caption)
      else attachment.caption
    end,
    extracted_text = case
      when attachment.mime_type like 'image/%'
        then coalesce(
          nullif(btrim(final_caption), ''),
          attachment.extracted_text
        )
      else attachment.extracted_text
    end
  where attachment.room_id = target_room_id
    and attachment.uploaded_by = auth.uid()
    and attachment.message_id is null
    and attachment.discard_pending = false
    and attachment.id = any(target_attachment_ids)
    and exists (
      select 1
      from public.messages as message
      where message.id = target_message_id
        and message.room_id = target_room_id
        and message.author_id = auth.uid()
    )
  returning attachment.id;

  get diagnostics linked_count = row_count;
  if linked_count <> requested_count then
    raise exception 'Not every staged attachment could be linked'
      using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.link_staged_discovery_attachments(
  uuid, uuid, uuid[], text
) from public;
grant execute on function public.link_staged_discovery_attachments(
  uuid, uuid, uuid[], text
) to authenticated;
