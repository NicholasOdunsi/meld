create or replace function public.link_staged_discovery_attachments(
  target_room_id uuid,
  target_message_id uuid,
  target_attachment_ids uuid[],
  final_caption text
)
returns table (attachment_id uuid)
language sql
security invoker
set search_path = public
as $$
  update public.attachments as attachment
  set
    message_id = target_message_id,
    caption = case
      when attachment.mime_type like 'image/%' then final_caption
      else attachment.caption
    end,
    extracted_text = case
      when attachment.mime_type like 'image/%' then final_caption
      else attachment.extracted_text
    end
  where attachment.room_id = target_room_id
    and attachment.uploaded_by = auth.uid()
    and attachment.message_id is null
    and attachment.id = any(target_attachment_ids)
    and exists (
      select 1
      from public.messages as message
      where message.id = target_message_id
        and message.room_id = target_room_id
        and message.author_id = auth.uid()
    )
  returning attachment.id;
$$;

revoke all on function public.link_staged_discovery_attachments(
  uuid, uuid, uuid[], text
) from public;
grant execute on function public.link_staged_discovery_attachments(
  uuid, uuid, uuid[], text
) to authenticated;
