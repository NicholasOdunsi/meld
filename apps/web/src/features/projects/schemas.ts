import { z } from "zod";

// The curated set a project's icon can be chosen from at creation. Stored as
// the key (not a component reference) so the database only ever holds a
// small, validated vocabulary -- see project-icons.tsx for the key -> glyph
// mapping used to render it.
export const PROJECT_ICON_OPTIONS = [
  "folder",
  "rocket",
  "target",
  "light-bulb",
  "flag",
  "star",
  "heart",
  "briefcase",
  "bar-chart",
  "calendar",
  "bookmark",
  "trophy",
  "shield",
  "compass",
  "puzzle",
  "megaphone",
  "gift",
  "camera",
  "palette",
  "globe",
  "bank",
  "coins",
  "credit-card",
  "wallet",
  "crown",
  "graduation-cap",
  "analytics",
  "receipt",
  "shop",
  "seedlings",
] as const;

export type ProjectIcon = (typeof PROJECT_ICON_OPTIONS)[number];

export const ProjectIconSchema = z.enum(PROJECT_ICON_OPTIONS);

export const DEFAULT_PROJECT_ICON: ProjectIcon = "folder";

// The curated set a project's icon colour can be chosen from. Each key
// resolves through `PROJECT_COLOR_VARS` to a `--meld-project-*` token, never
// to arbitrary hex.
//
// Ten keys, but the brand palette behind them is smaller, so `cyan` paints as
// `blue`, `green` as `teal` and `orange` as `red` -- ten options producing
// seven distinct results. Worth collapsing this list to the seven that are
// actually distinguishable; left alone for now because existing projects are
// stored against these keys.
export const PROJECT_COLOR_OPTIONS = [
  "teal",
  "blue",
  "purple",
  "pink",
  "red",
  "yellow",
  "orange",
  "cyan",
  "green",
  "gray",
] as const;

export type ProjectColor = (typeof PROJECT_COLOR_OPTIONS)[number];

export const ProjectColorSchema = z.enum(PROJECT_COLOR_OPTIONS);

export const DEFAULT_PROJECT_COLOR: ProjectColor = "blue";

// The one project every workspace has for questions typed into the deck's
// field. Created by create_workspace_with_project at signup; identified by
// projects.is_scratch, never by this name.
export const SCRATCH_PROJECT_NAME = "Scratch";

export type ProjectSummary = {
  id: string;
  workspaceId: string;
  name: string;
  createdBy: string;
  icon: ProjectIcon;
  color: ProjectColor;
  isScratch: boolean;
};

export const ProjectNameSchema = z.string().trim().min(1).max(120);

export const WorkspaceProjectReferenceSchema = z.object({
  workspaceId: z.string().uuid(),
});

export const CreateProjectInputSchema = WorkspaceProjectReferenceSchema.extend({
  name: ProjectNameSchema,
  // Optional at the schema boundary -- callers that don't pass one (e.g.
  // direct API/test usage) fall back to DEFAULT_PROJECT_ICON/COLOR at the
  // write layer, and the database columns carry the same defaults.
  icon: ProjectIconSchema.optional(),
  color: ProjectColorSchema.optional(),
});

export const ProjectReferenceSchema = WorkspaceProjectReferenceSchema.extend({
  projectId: z.string().uuid(),
});

export const RenameProjectInputSchema = ProjectReferenceSchema.extend({
  name: ProjectNameSchema,
});

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;
export type ProjectReference = z.infer<typeof ProjectReferenceSchema>;
export type RenameProjectInput = z.infer<typeof RenameProjectInputSchema>;
