-- Hydration attaches the room's current PRD: the full document for a
-- prd_revise (the base to edit), a title-only summary for a room_reply (so
-- the agent knows a PRD exists and can offer to revise it). The existing
-- 512 KiB guard below still bounds the total, covering the added document.
CREATE OR REPLACE FUNCTION public.hydrate_authorized_room_context(target_task_id uuid, target_attempt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  active_device_id uuid;
  current_task public.ai_tasks%rowtype;
  current_attempt public.ai_task_attempts%rowtype;
  target_device_id uuid;
  hydrated_messages jsonb;
  hydrated_attachments jsonb;
  hydrated_evidence jsonb;
  hydrated_decisions jsonb;
  existing_prd jsonb;
  hydrated_context jsonb;
begin
  select task.device_id
  into target_device_id
  from public.ai_tasks as task
  where task.id = target_task_id;

  select device.id
  into active_device_id
  from public.execution_devices as device
  where device.id = target_device_id
    and device.status = 'active'
    and device.revoked_at is null
  for update;

  select task.*
  into current_task
  from public.ai_tasks as task
  where task.id = target_task_id
    and task.device_id = target_device_id
  for update;

  select attempt.*
  into current_attempt
  from public.ai_task_attempts as attempt
  where attempt.id = target_attempt_id
    and attempt.task_id = target_task_id
  for update;

  if active_device_id is null
    or current_task.id is null
    or current_attempt.id is null
    or current_task.status <> 'running'
    or current_task.device_id <> target_device_id
    or current_task.device_id <> current_attempt.device_id
    or current_attempt.settled_at is not null
    or current_attempt.lease_expires_at <= now()
  then
    raise exception 'stale_ai_task_attempt' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.room_participants as participant
    join public.memberships as membership
      on membership.user_id = participant.user_id
    join public.discovery_rooms as room
      on room.id = participant.room_id
      and room.organization_id = membership.organization_id
    where participant.room_id = current_task.room_id
      and participant.user_id = current_task.initiating_user_id
  ) then
    perform public.settle_ai_task(
      current_task.id,
      current_task.device_id,
      current_attempt.id,
      'fail',
      'permission_changed',
      'Room access changed before AI task execution.',
      null,
      false
    );
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'permission_changed'
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', message.id,
        'authorName', coalesce(
          nullif(btrim(author.raw_user_meta_data ->> 'display_name'), ''),
          nullif(btrim(author.raw_user_meta_data ->> 'full_name'), ''),
          nullif(btrim(author.raw_user_meta_data ->> 'name'), ''),
          nullif(split_part(author.email, '@', 1), ''),
          message.author_id::text
        ),
        'text', message.body,
        'createdAt', to_char(
          message.created_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )
      )
      order by message.created_at, message.id
    ),
    '[]'::jsonb
  )
  into hydrated_messages
  from public.messages as message
  join auth.users as author on author.id = message.author_id
  where message.room_id = current_task.room_id
    and message.id in (
      select value::uuid
      from jsonb_array_elements_text(
        current_task.context_manifest_json -> 'messageIds'
      ) as value
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', attachment.id,
        'name', attachment.original_name,
        'mimeType', attachment.mime_type,
        'extractedText', (
          case
            when attachment.extraction_status = 'ready'
              then attachment.extracted_text
            else null
          end
        ),
        'userCaption', attachment.caption
      )
      order by attachment.created_at, attachment.id
    ),
    '[]'::jsonb
  )
  into hydrated_attachments
  from public.attachments as attachment
  where attachment.room_id = current_task.room_id
    and attachment.id in (
      select value::uuid
      from jsonb_array_elements_text(
        current_task.context_manifest_json -> 'attachmentIds'
      ) as value
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', evidence.id,
        'title', evidence.title,
        'note', evidence.note
      )
      order by evidence.created_at, evidence.id
    ),
    '[]'::jsonb
  )
  into hydrated_evidence
  from public.evidence as evidence
  where evidence.room_id = current_task.room_id
    and evidence.id in (
      select value::uuid
      from jsonb_array_elements_text(
        current_task.context_manifest_json -> 'evidenceIds'
      ) as value
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', decision.id,
        'summary', decision.summary,
        'sourceMessageId', decision.source_message_id
      )
      order by decision.created_at, decision.id
    ),
    '[]'::jsonb
  )
  into hydrated_decisions
  from public.decisions as decision
  where decision.room_id = current_task.room_id
    and decision.id in (
      select value::uuid
      from jsonb_array_elements_text(
        current_task.context_manifest_json -> 'decisionIds'
      ) as value
    );

  hydrated_context := jsonb_build_object(
    'taskId', current_task.id,
    'initiatingUserId', current_task.initiating_user_id,
    'organizationId', current_task.organization_id,
    'roomId', current_task.room_id,
    'kind', current_task.kind,
    'instruction', current_task.instruction,
    'messages', hydrated_messages,
    'attachments', hydrated_attachments,
    'evidence', hydrated_evidence,
    'decisions', hydrated_decisions
  );

  -- Attach the current PRD so a revision can edit it and a room reply knows one
  -- exists. A revision carries the whole document; a room reply carries only a
  -- title summary so the agent can offer to update it.
  if current_task.kind in ('prd_revise', 'room_reply') then
    select case
      when current_task.kind = 'prd_revise'
        then jsonb_build_object('version', prd.version, 'document', prd.document)
      else jsonb_build_object('version', prd.version, 'title', prd.document ->> 'title')
    end
    into existing_prd
    from public.prds as prd
    where prd.room_id = current_task.room_id
    order by prd.version desc
    limit 1;

    if existing_prd is not null then
      hydrated_context := hydrated_context
        || jsonb_build_object('existingPrd', existing_prd);
    end if;
  end if;

  if octet_length(hydrated_context::text) > 524288 then
    perform public.settle_ai_task(
      current_task.id,
      current_task.device_id,
      current_attempt.id,
      'fail',
      'unknown',
      'Hydrated AI task context exceeds 512 KiB.',
      null,
      false
    );
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'context_too_large'
    );
  end if;

  return jsonb_build_object(
    'status', 'ready',
    'context', hydrated_context
  );
end;
$function$;
