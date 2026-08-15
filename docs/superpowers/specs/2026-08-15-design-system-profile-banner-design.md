# Design Room — design-system profile upload banner

## Context

The Design Room's screen-generation pipeline (`docs/superpowers/specs/2026-08-13-design-room-design.md`) already works end to end for screens: `design_screen_generate` is wired, executes against the connector, and `prototype-reader.ts` already reads `design_system_profiles` / `design_system_profile_versions` when hydrating a screen generation, falling back to a neutral default when no profile exists.

What was never wired is the *other* half of that spec — getting a workspace's own design-system document turned into a `DesignProfile` in the first place. The backend for this is **already fully built and unused**:

- `packages/contracts/src/design-profile.ts` — `DesignProfileSchema`, `DesignProfileDistillResultSchema`.
- `packages/prototype/src/token-css.ts` — `compileTokenCss`.
- `supabase/migrations/202608130005_design_profiles.sql` — `design_system_profiles` (one row per workspace, `active_version_id`), `design_system_profile_versions` (immutable), and a dedicated `design-system` storage bucket with workspace-scoped RLS (`storage_workspace_id`).
- `supabase/migrations/202608130010_design_task_rpcs.sql` — `create_design_profile_distill_task(target_room_id, target_provider, source_object_path)` (room-editor gated, advisory-locked per room, dedupes an in-flight task) and `get_design_profile_distillation(task_id)` (returns `task_id, version_id, is_active`). A trigger, `materialize_design_profile_distill`, promotes the resulting version and sets `active_version_id` on completion.
- `apps/connector/src/tasks/design-profile-distill-prompt.ts` — the connector already executes the task kind end to end against the fake provider.

None of it is called from `apps/web`. There is no UI path — upload or otherwise — that ever creates a `design_profile_distill` task. This spec is the missing app-layer piece: a banner that gets a user from "I have a design system document" to "the workspace has an active profile," with zero new database work.

## Goal

The first time someone tries to generate a screen in a workspace that has no active design-system profile, a non-blocking banner in the Canvas composer offers to upload one. Uploading kicks off the existing `design_profile_distill` task; once it resolves, every subsequent screen generation in that workspace uses the new tokens automatically. Skipping or ignoring the banner costs nothing — generation already works against a neutral default.

## Decisions (from brainstorming)

1. **Single trigger, no stage-gating.** The banner is driven by "the workspace has no active design profile AND the user has reached the screen-generation composer," not by room stage. Canvas (and its composer) can appear before a room is formally in Design stage (`hasUserFlow` alone surfaces it), and generation itself isn't stage-gated, so gating the banner on stage would create a confusing gap. No content/intent parsing of what the user typed — the act of being in the generating composer is signal enough.
2. **Non-blocking.** The banner never gates the "Generate" action. This matches the existing system rule that a missing profile is not a blocker.
3. **Canvas only.** The banner lives in/near `ScreenComposer`, not the general room chat composer — generation only ever happens from Canvas, so that's the only place the underlying condition is relevant.
4. **Persistent until resolved, not dismiss-once.** The banner reappears on every visit to Canvas as long as the workspace has no active profile — dismissing it (✕) only hides it for the current session/visit, it does not suppress it permanently. It disappears for good, everywhere in the workspace, the moment `design_system_profiles.active_version_id` is set.
5. **One-shot upload, not staged.** Clicking "Upload design system" opens a native file picker; selecting a file immediately uploads and fires the distill task. No separate staging/confirm step — unlike a chat attachment, there is no message being composed here.
6. **No new file-type or size policy.** Reuses whatever the existing attachment pipeline already accepts (`apps/web/src/features/rooms/attachment-extractor.ts`: text/markdown/html, PDF, images). No design-system-specific validation to invent.
7. **Out of scope: viewing/editing the distilled profile.** This spec only gets a profile *into* the workspace and consumed silently by generation. A workspace-settings view/editor for the profile is a separate future piece — there's no existing settings surface to fit it into yet, and it isn't needed to unblock generation.

## Architecture and data flow

### New pieces

| Piece | Location | Purpose |
|---|---|---|
| `useActiveDesignProfile(workspaceId)` | `apps/web/src/features/design/design-profile-reader.ts` (new) | Reads `design_system_profiles.active_version_id` for the workspace. `null`/no row → no active profile. |
| `DesignSystemBanner` | `apps/web/src/features/design/components/design-system-banner.tsx` (new) | Renders inside/near `ScreenComposer`. States: `idle` (upload CTA), `uploading`, `distilling` (polling), `error`, and not-rendered (profile active, or dismissed this session). |
| `uploadDesignSystemDocument` | `apps/web/src/features/design/design-profile-distillation.ts` (new) | Server action: uploads bytes to the `design-system` storage bucket at `${workspaceId}/${uuid}-${filename}`, then calls `create_design_profile_distill_task(roomId, null, objectPath)`. |
| `useDesignProfileDistillation(taskId)` | same new file | Polls `get_design_profile_distillation(taskId)` on the existing interval/backoff pattern already used by `use-design-screen-generation.ts`, until `version_id` lands or the task fails. |

Nothing changes in `packages/contracts`, `packages/prototype`, the connector, or any migration — this is app-layer only.

### Flow

1. Canvas mounts `ScreenComposer`. `useActiveDesignProfile` reads the room's workspace's `design_system_profiles` row.
2. No active version and not dismissed this session → `DesignSystemBanner` renders in `idle` state.
3. User clicks "Upload design system" → native file picker → on file selection, `uploadDesignSystemDocument` runs: upload to the `design-system` bucket, then `create_design_profile_distill_task`. Banner moves to `distilling`.
4. `useDesignProfileDistillation` polls `get_design_profile_distillation(taskId)`. The existing `materialize_design_profile_distill` trigger promotes the version and sets `active_version_id` server-side when the connector's result lands.
5. On `version_id` present → banner state clears; `useActiveDesignProfile`'s next read (or a direct signal from the hook) confirms an active profile exists, and the banner stops rendering anywhere in the workspace from then on.
6. Screen generation is untouched — `prototype-reader.ts` already threads the active profile's token CSS into `design_screen_generate` whenever one exists.

### Dismiss semantics

The ✕ sets local component state only (not persisted to any table or localStorage) — a fresh page load or remount re-evaluates purely from whether an active profile exists. This deliberately avoids adding any new persistence just to track "did they see it."

## Error handling

- **Upload failure** (storage rejection, unsupported/mismatched MIME type): banner shows an inline error message and reverts to `idle`, reusing the existing typed errors already thrown by attachment handling (e.g. "The declared MIME type does not match the file.").
- **Distillation failure** (connector/model error, unreadable document): the poll resolves to a failure; banner shows a brief failure note and reverts to `idle`. Since no version was created, the workspace still has no active profile, so this is indistinguishable from "never tried" on the next visit — consistent with the persistent-until-resolved behavior.
- **Double-submit**: `create_design_profile_distill_task` already advisory-locks per room and checks for an outstanding non-terminal task before creating a new one. The banner additionally disables its own button locally while `uploading`/`distilling`.

## Testing

- `useActiveDesignProfile`: no row → not active; row with null `active_version_id` → not active; row with a version → active.
- `DesignSystemBanner`: renders per state (`idle`/`uploading`/`distilling`/`error`/hidden); ✕ hides for the session only and the condition re-evaluates on remount; hidden entirely once a profile is active.
- `uploadDesignSystemDocument` / `useDesignProfileDistillation`: pattern-matched against the existing coverage in `design-screen-generation.test.ts` / `use-design-screen-generation.ts`.
- Extend `apps/web/src/features/rooms/e2e-fake.ts` (already has `design_profile_distill` fixtures) for a Canvas-level integration test: banner visible → upload → distilling → resolved → banner gone workspace-wide → a subsequent screen generation reflects the new tokens.

## Scope

**In v1:** the banner, upload trigger, and consumption of the already-built distillation pipeline exactly as described above.

**Explicitly not in v1:** viewing or editing the distilled profile anywhere in the app (decision 7); any change to how screens consume the profile (already works); any new file-type/size policy; any stage-gating of the banner; persisting dismissal beyond the current session.
