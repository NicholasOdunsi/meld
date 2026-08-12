-- A Project's icon colour is chosen from a small curated set alongside its
-- icon (see PROJECT_COLOR_OPTIONS in apps/web/src/features/projects/schemas.ts)
-- -- the design system's non-semantic icon swatches, not free text.
--
-- Same reasoning as 202608120001_project_icon.sql: the default keeps every
-- existing row (and create_workspace_with_project's explicit column list)
-- valid without a backfill.
alter table public.projects
  add column color text not null default 'blue';

alter table public.projects
  add constraint projects_color_check
  check (
    color in (
      'blue',
      'cyan',
      'gray',
      'green',
      'orange',
      'pink',
      'purple',
      'red',
      'teal',
      'yellow'
    )
  );
