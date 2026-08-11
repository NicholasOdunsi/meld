alter table public.messages
  add column web_sources jsonb not null default '[]'::jsonb;

create function public.ai_web_sources_ok(target_sources jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(target_sources) = 'array'
    and jsonb_array_length(target_sources) <= 20
    and not exists (
      select 1
      from jsonb_array_elements(target_sources) as source(value)
      where jsonb_typeof(value) <> 'object'
        or jsonb_typeof(value -> 'title') <> 'string'
        or char_length(btrim(value ->> 'title')) not between 1 and 300
        or jsonb_typeof(value -> 'url') <> 'string'
        or char_length(value ->> 'url') not between 1 and 2000
        or (value ->> 'url') !~ '^https?://'
        or (
          value ? 'publisher'
          and value -> 'publisher' <> 'null'::jsonb
          and (
            jsonb_typeof(value -> 'publisher') <> 'string'
            or char_length(btrim(value ->> 'publisher')) not between 1 and 200
          )
        )
        or (
          value ? 'publishedAt'
          and value -> 'publishedAt' <> 'null'::jsonb
          and (
            jsonb_typeof(value -> 'publishedAt') <> 'string'
            or char_length(btrim(value ->> 'publishedAt')) not between 1 and 100
          )
        )
        or exists (
          select 1
          from jsonb_object_keys(value) as source_key(key)
          where key not in ('title', 'url', 'publisher', 'publishedAt')
        )
    );
$$;

alter table public.messages
  add constraint messages_web_sources_shape
    check (public.ai_web_sources_ok(web_sources)),
  add constraint messages_human_web_sources
    check (author_type <> 'human' or web_sources = '[]'::jsonb),
  add constraint messages_product_agent_web_sources
    check (author_type <> 'product_agent' or web_sources = '[]'::jsonb),
  add constraint messages_research_agent_provenance check (
    author_type <> 'research_agent'
    or (
      author_id is null
      and initiated_by is not null
      and ai_task_id is not null
      and provider is not null
      and proposed_action is null
    )
  );

-- settle_ai_task still inserts the canonical room reply as product_agent. This
-- trigger changes only research replies and copies a validated source list from
-- the already-settled task result. Invalid source metadata is discarded while
-- the useful research answer still lands in the room.
create function public.materialize_research_agent_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task public.ai_tasks%rowtype;
  candidate_sources jsonb;
begin
  if new.ai_task_id is null then
    return new;
  end if;

  select candidate.*
  into task
  from public.ai_tasks as candidate
  where candidate.id = new.ai_task_id;

  if task.agent_kind <> 'research' then
    new.web_sources := '[]'::jsonb;
    return new;
  end if;

  new.author_type := 'research_agent';
  new.proposed_action := null;
  candidate_sources := task.result_json -> 'payload' -> 'webSources';

  if task.research_scope = 'web'
    and public.ai_web_sources_ok(candidate_sources)
  then
    new.web_sources := candidate_sources;
  else
    new.web_sources := '[]'::jsonb;
  end if;

  return new;
end;
$$;

create trigger messages_materialize_research_agent
before insert on public.messages
for each row
when (new.ai_task_id is not null)
execute function public.materialize_research_agent_message();
