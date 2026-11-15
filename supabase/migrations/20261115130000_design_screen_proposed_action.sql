-- Let the Product Agent propose building a screen. A strict superset of the
-- previous rule: every shape accepted before is still accepted. The CHECK
-- constraint on public.messages and settlement_room_proposed_action both call
-- this function, so nothing else needs to change.
create or replace function public.room_proposed_action_shape_ok(target_action jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    target_action in (
      '{"kind":"prd_generate"}'::jsonb,
      '{"kind":"prd_revise"}'::jsonb,
      '{"kind":"user_flow_generate"}'::jsonb
    )
    or (
      target_action = jsonb_build_object(
        'kind', 'decision_capture',
        'summary', target_action -> 'summary',
        'sourceMessageId', target_action -> 'sourceMessageId'
      )
      and jsonb_typeof(target_action -> 'summary') = 'string'
      and char_length(
        regexp_replace(
          target_action ->> 'summary',
          '^[[:space:]]+|[[:space:]]+$',
          '',
          'g'
        )
      ) between 1 and 5000
      and (
        jsonb_typeof(target_action -> 'sourceMessageId') = 'null'
        or (
          jsonb_typeof(target_action -> 'sourceMessageId') = 'string'
          and (target_action ->> 'sourceMessageId') ~*
            '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
      )
    )
    or (
      target_action = jsonb_build_object(
        'kind', 'design_screen',
        'instruction', target_action -> 'instruction',
        'name', target_action -> 'name',
        'screenId', target_action -> 'screenId'
      )
      and jsonb_typeof(target_action -> 'instruction') = 'string'
      and char_length(
        regexp_replace(
          target_action ->> 'instruction',
          '^[[:space:]]+|[[:space:]]+$',
          '',
          'g'
        )
      ) between 1 and 4000
      and (
        jsonb_typeof(target_action -> 'name') = 'null'
        or (
          jsonb_typeof(target_action -> 'name') = 'string'
          and char_length(
            regexp_replace(
              target_action ->> 'name',
              '^[[:space:]]+|[[:space:]]+$',
              '',
              'g'
            )
          ) between 1 and 80
        )
      )
      and (
        jsonb_typeof(target_action -> 'screenId') = 'null'
        or (
          jsonb_typeof(target_action -> 'screenId') = 'string'
          and (target_action ->> 'screenId') ~*
            '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
      )
    ),
    false
  );
$$;
