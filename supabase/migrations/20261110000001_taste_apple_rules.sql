-- Apple HIG guardrail switch for the native Taste screen
-- (spec: docs/superpowers/specs/2026-11-10-native-taste-design.md, B5a).
alter table public.taste_profiles
  add column apple_rules boolean not null default true;
