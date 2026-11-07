import { z } from "zod";

// Fixed vocabulary for inspiration auto-sorting. The SQL check constraints in
// supabase/migrations/20261107000001_inspiration_labels.sql mirror these lists
// -- change both together.
export const INSPIRATION_DEVICES = ["mobile", "tablet", "web", "desktop_app"] as const;
export const INSPIRATION_SCREEN_TYPES = [
  "login", "signup", "onboarding", "home", "dashboard", "list", "detail", "search",
  "profile", "settings", "pricing", "checkout", "cart", "chat", "editor", "calendar",
  "map", "empty_state", "error", "landing", "modal", "other",
] as const;
export const INSPIRATION_PATTERNS = [
  "tab_bar", "sidebar", "top_nav", "cards", "table", "chart", "form", "modal", "sheet",
  "search_bar", "filters", "hero", "carousel", "grid", "list_rows", "avatar", "badges",
  "stepper", "toolbar", "fab", "illustration", "media_player",
] as const;
export const INSPIRATION_THEMES = ["light", "dark"] as const;

export type InspirationDevice = (typeof INSPIRATION_DEVICES)[number];
export type InspirationScreenType = (typeof INSPIRATION_SCREEN_TYPES)[number];
export type InspirationPattern = (typeof INSPIRATION_PATTERNS)[number];

export const InspirationLabelsSchema = z.object({
  device: z.enum(INSPIRATION_DEVICES),
  screenType: z.enum(INSPIRATION_SCREEN_TYPES),
  patterns: z
    .array(z.enum(INSPIRATION_PATTERNS))
    .max(6)
    .refine((values) => new Set(values).size === values.length, "patterns must not repeat"),
  theme: z.enum(INSPIRATION_THEMES),
  colors: z.array(z.string().trim().toLowerCase().regex(/^#[0-9a-f]{6}$/)).min(1).max(5),
  styleWords: z.array(z.string().trim().toLowerCase().regex(/^[a-z][a-z-]{0,19}$/)).max(3),
  description: z.string().trim().min(1).max(400),
});
export type InspirationLabels = z.infer<typeof InspirationLabelsSchema>;
