-- Enrich hydration so the connector receives the components to build, the
-- tokens to build them against, and up to three already-built components to
-- match. Preserve the current implementation unchanged.
--
-- Which function this wraps. The two-argument entrypoint has been renamed
-- four times already -- `_pre_user_flow` (202608100002), `_pre_design`
-- (202608130010), `_pre_user_flow_assist` (202608140002) and
-- `_pre_design_profile_distill` (202608150007). 202608150007 is the last
-- migration that CREATES `public.hydrate_authorized_room_context`, so the
-- live entrypoint is its `designSystemSource` wrapper and that is what this
-- one delegates to under its new name. (20260819000001 also touches the
-- chain, but only with `create or replace` on the already-renamed
-- `_pre_user_flow_assist` link, so it does not move the head.) Everything
-- that is not a `design_component_build` task is returned exactly as the
-- inner chain produced it, including its `rejected` results.

alter function public.hydrate_authorized_room_context(uuid, uuid)
  rename to hydrate_authorized_room_context_pre_component_build;

revoke all on function public.hydrate_authorized_room_context_pre_component_build(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.hydrate_authorized_room_context_pre_component_build(uuid, uuid)
  to service_role;

create function public.hydrate_authorized_room_context(
  target_task_id uuid,
  target_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  hydrated_result jsonb;
  hydrated_context jsonb;
  build public.design_component_builds;
  pass public.design_component_build_passes;
  target_version public.design_system_profile_versions;
  profile_components jsonb;
  targets jsonb;
  references_json jsonb;
  target_device_id uuid;
begin
  hydrated_result := public.hydrate_authorized_room_context_pre_component_build(
    target_task_id, target_attempt_id
  );

  if hydrated_result ->> 'status' <> 'ready'
    or hydrated_result #>> '{context,kind}' <> 'design_component_build'
  then
    return hydrated_result;
  end if;

  select * into build from public.design_component_builds
  where task_id = target_task_id;
  if not found then return hydrated_result; end if;

  select * into pass from public.design_component_build_passes
  where id = build.pass_id;
  if not found then return hydrated_result; end if;

  -- The pass's CURRENT target version, not the copy it started from. Each
  -- merged batch appends a new version and advances `target_version_id`
  -- (202608270002), so reading the pointer at hydration time is what lets a
  -- later batch see the components earlier batches built -- which is exactly
  -- what makes the references below this workspace's own freshly built
  -- components rather than only whatever the distiller happened to ship.
  select * into target_version from public.design_system_profile_versions
  where id = pass.target_version_id;
  if not found then return hydrated_result; end if;

  -- Shape-checked rather than trusted, for the same reason
  -- `pending_design_components` guards it: `jsonb_array_elements` over a
  -- profile whose `components` is not an array raises, and an exception here
  -- does not merely skip the enrichment -- it propagates out of hydration, so
  -- the connector can never fetch the context and the batch wedges.
  profile_components := case
    when jsonb_typeof(target_version.profile_json -> 'components') = 'array'
      then target_version.profile_json -> 'components'
    else '[]'::jsonb
  end;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', entry.component ->> 'name',
        -- `rules` is required and non-empty in `DesignProfileSchema`, but a
        -- profile row is only ever as good as the payload that wrote it, and
        -- `AIContextPackageSchema` types this as a plain string. A missing
        -- one becomes empty rather than json null, which would not parse.
        'rules', coalesce(entry.component ->> 'rules', '')
      )
      order by entry.ordinality
    ),
    '[]'::jsonb
  )
  into targets
  from jsonb_array_elements(profile_components)
    with ordinality as entry(component, ordinality)
  where jsonb_typeof(entry.component) = 'object'
    and entry.component ->> 'name' = any(build.component_names);

  -- `componentBuild.targets` is `.min(1)` in `AIContextPackageSchema`, so an
  -- empty list is not a package the connector can parse -- it would reject
  -- the whole context, not just this field. A batch whose components have
  -- gone from the profile is therefore left un-enriched (the connector sees
  -- an ordinary room context and fails the task on its own terms) rather than
  -- hydrated into something that cannot validate.
  if jsonb_array_length(targets) = 0 then
    return hydrated_result;
  end if;

  -- At most three already-built components, as style references, taken in the
  -- order the profile lists them so that the same batch always sees the same
  -- three. The components this batch is building are excluded: a target is
  -- prose-only by definition, and it must never be offered its own markup as
  -- the example to match.
  select coalesce(
    jsonb_agg(chosen.reference order by chosen.ordinality),
    '[]'::jsonb
  )
  into references_json
  from (
    select
      jsonb_build_object(
        'name', entry.component ->> 'name',
        'html', entry.component ->> 'html',
        'css', coalesce(entry.component ->> 'css', '')
      ) as reference,
      entry.ordinality as ordinality
    from jsonb_array_elements(profile_components)
      with ordinality as entry(component, ordinality)
    where jsonb_typeof(entry.component) = 'object'
      and jsonb_typeof(entry.component -> 'name') = 'string'
      and coalesce(entry.component ->> 'html', '') <> ''
      and not (entry.component ->> 'name' = any(build.component_names))
    order by entry.ordinality
    limit 3
  ) as chosen;

  hydrated_context := (hydrated_result -> 'context')
    || jsonb_build_object(
      'componentBuild',
      jsonb_build_object(
        'tokenCss', coalesce(target_version.token_css, ''),
        'targets', targets,
        'references', references_json
      )
    );

  -- The same 512 KiB ceiling every other link in this chain enforces for its
  -- own kind. A profile is capped at 64 KiB and token CSS at 64 KiB, so this
  -- is a backstop rather than a limit a real build should meet.
  if octet_length(hydrated_context::text) > 524288 then
    select task.device_id into target_device_id
    from public.ai_tasks as task where task.id = target_task_id;

    perform public.settle_ai_task(
      target_task_id,
      target_device_id,
      target_attempt_id,
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

  return jsonb_set(hydrated_result, '{context}', hydrated_context);
end;
$$;

revoke all on function public.hydrate_authorized_room_context(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.hydrate_authorized_room_context(uuid, uuid)
  to service_role;
