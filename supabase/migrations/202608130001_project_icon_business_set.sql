-- Widens the Project icon picker with 10 more business-flavoured options
-- (see PROJECT_ICON_OPTIONS in apps/web/src/features/projects/schemas.ts,
-- kept in sync with this constraint per the note on 202608120001_project_icon.sql).
-- Existing rows are untouched -- this only widens what's allowed, it never
-- narrows it, so no backfill is needed.
alter table public.projects
  drop constraint projects_icon_check;

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
      'globe',
      'bank',
      'coins',
      'credit-card',
      'wallet',
      'crown',
      'graduation-cap',
      'analytics',
      'receipt',
      'shop',
      'seedlings'
    )
  );
