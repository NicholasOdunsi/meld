import { z } from "zod";

// Mirrors supabase/migrations/20261123235526_build_mode.sql -- change both together.
export const MAX_BUILD_CHANGED_FILES = 200;
export const BUILD_STEP_MIN_INTERVAL_MS = 2_000;

export const BuildStatusSchema = z.enum(["working", "needs_you", "done", "failed", "cancelled"]);
export type BuildStatus = z.infer<typeof BuildStatusSchema>;

export const CodeLinkKindSchema = z.enum(["github", "folder", "new_github"]);
export type CodeLinkKind = z.infer<typeof CodeLinkKindSchema>;

export const RouteIntentSchema = z.enum(["answer", "build", "unsure"]);
export type RouteIntent = z.infer<typeof RouteIntentSchema>;

export const ChangedFileSchema = z.object({
  path: z.string().min(1).max(1_000),
  added: z.number().int().min(0),
  removed: z.number().int().min(0),
}).strict();
export type ChangedFile = z.infer<typeof ChangedFileSchema>;

export const ApprovalRequestSchema = z.object({
  id: z.string().min(1).max(200),
  summary: z.string().trim().min(1).max(500),
  choices: z.array(z.object({
    id: z.string().min(1).max(100),
    label: z.string().trim().min(1).max(60),
  }).strict()).min(1).max(6),
}).strict();
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const BuildEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), status: BuildStatusSchema }).strict(),
  z.object({ type: z.literal("step"), label: z.string().trim().min(1).max(200) }).strict(),
  z.object({ type: z.literal("reply"), text: z.string().max(100_000) }).strict(),
  z.object({ type: z.literal("changed_files"), files: z.array(ChangedFileSchema).max(MAX_BUILD_CHANGED_FILES) }).strict(),
  z.object({ type: z.literal("branch"), name: z.string().min(1).max(250) }).strict(),
  z.object({ type: z.literal("approval_request"), request: ApprovalRequestSchema }).strict(),
  z.object({ type: z.literal("engine_offline") }).strict(),
]);
export type BuildEvent = z.infer<typeof BuildEventSchema>;
