-- A Project's icon is chosen from a small curated set at creation time (see
-- PROJECT_ICON_OPTIONS in apps/web/src/features/projects/schemas.ts) rather
-- than free text, so the check constraint below is the source of truth the
-- app schema has to stay in sync with.
--
-- The default keeps every existing row (and any insert that doesn't name the
-- column, e.g. create_workspace_with_project's explicit column list) valid
-- without a backfill.
alter table public.projects
  add column icon text not null default 'folder';

alter table public.projects
  add constraint projects_icon_check
  check (
    icon in (
      'folder',
      'rocket',
      'target',
      'light-bulb',
      'flag',
      'star',
      'heart',
      'briefcase',
      'bar-chart',
      'calendar',
      'bookmark',
      'trophy',
      'shield',
      'compass',
      'puzzle',
      'megaphone',
      'gift',
      'camera',
      'palette',
      'globe'
    )
  );
