# AI-Assisted PRD Editing

## Goal

Let someone change a PRD by asking the Product Agent, from inside the PRD
itself: highlight text, say what you want, review what comes back, apply it.

Two rules shape everything else:

- **The gate is on authorship, not on saving.** Text you typed yourself needs
  no review step, so hand edits autosave. Text the agent wrote has been read by
  nobody, so it arrives as a proposal you must explicitly apply.
- **A version records a decision, not a keystroke.** Editing — by hand or by
  applying a proposal — never creates a version. Only acceptance settles a
  state, and the snapshot is cut lazily, when someone first edits past it.

## Current state

The PRD tab renders a `PRDDocument` as 15 typed sections driven by
`PRD_SECTIONS` (`apps/web/src/features/prd/prd-sections.ts`), with an outline
rail on the right (`prd-document.tsx`). Editing is all-or-nothing: an Edit
button swaps the whole body for `PrdEditor`, which clones the document into a
draft, tracks dirtiness, and commits through `savePrdVersion` — every save
inserting a new row, because `prds` stores one row per version
(`202608020003_prds.sql`, `unique (room_id, version)`). Acceptance is
irreversible and terminal.

AI changes exist but start only from chat: `@Product Agent` in the conversation
produces a reply carrying `proposedAction: prd_revise`, and
`create_prd_revise_task` takes **the body of the triggering message** as its
instruction, ships the whole document to the connector on the user's Mac, and
saves the returned document as a new version. There is no way to ask for a
change from the document, and no scoping — a revision may rewrite anything.

`diffPrdDocuments` (`prd-diff.ts`) exists and is currently unused, left over
from a deleted gap-review feature.

## Behavior

### Asking

Selecting text inside a section opens a composer popover immediately — no
intermediate button. It autofocuses; Escape closes it and restores the
selection. It shows the section it is scoped to and quotes the selected text,
so the constraint is visible before sending, not discovered afterwards.

The Product Agent is the default recipient: you just type. `@` opens a floating
mention list layered **above** the input — the input never grows — matching the
room composer's typeahead. For now the list contains agents only; teammates
appear there later (see Non-goals).

Sending queues a `prd_section_revise` task. The section heading shows a working
marker and the tray opens automatically on the right, listing in-flight and
resolved requests. The document is untouched throughout, so you are free to scroll away,
edit elsewhere, or fire requests at other sections.

### Reviewing

The result lands **in the section**: the old value struck through, the new
value marked as added, with **Apply** and **Discard** beneath it. You judge the
rewrite with its neighbours visible. The tray tracks that a proposal exists and
links to it.

**Apply** splices that one field into the live document, autosaves, and offers
a brief **Undo** that restores the previous value. **Discard** leaves nothing
behind.

While the tray is open it displaces `PrdOutlineRail`; there is not room for
both, and the tray is the more urgent of the two.

Asking works in read mode — you highlight rendered text. Only hand-editing
requires Edit mode.

### Saving and versioning

Hand edits autosave per field. There is no Save button and no Cancel.

Acceptance sets a settle marker and nothing more; the document stays editable
afterwards. A frozen version is cut **lazily**: the first write that lands on a
document whose current revision equals its settled revision first snapshots the
settled bytes into `prd_versions`, then applies the write. A PRD that is
accepted and never touched again has no snapshot rows — the live document *is*
the record.

The user-facing version number is always `count(prd_versions) + 1`, so it
reads the same before and after the lazy freeze and never shifts.

### Conversation

Asking, working, and discarding stay in the PRD tray. **Applying** posts one
compact entry to the conversation — *"Nicholas revised Risks & mitigations with
the Product Agent"* — expandable to the instruction and the diff. The
conversation therefore records what actually changed the document, not every
attempt. Undo removes the entry.

## Data

`prds` becomes the **live document**: one row per room, dropping `version` and
`status` in favour of `document`, a monotonic internal `revision`, and
`settled_at` / `settled_by` / `settled_revision`. Status is no longer stored —
it is derived: a document is *accepted* while `revision = settled_revision`,
and a *draft with changes since v(n)* otherwise.

`prd_versions` is new and append-only: `room_id`, `version`, `document`,
`settled_at`, `settled_by`.

`prd_proposals` is new: `room_id`, `task_id`, `section_field`, `instruction`,
`quoted_selection`, `proposed_value` (jsonb — the one field's value only),
`base_value_hash`, `status`
(`pending` | `applied` | `discarded` | `stale` | `failed`),
`applied_previous_value`, `created_by`, timestamps.

Storing only the single field's value is the scope guarantee expressed in the
schema: there is physically nowhere to record a change to another section.

Staleness is narrow — a proposal is stale only when
`hash(current[section_field]) ≠ base_value_hash`. Edits anywhere else in the
document leave it applicable.

`messages` gains a `kind` column and a nullable `prd_proposal_id`, so the
compact PRD-change entry can be distinguished from an ordinary message and can
render its diff on expand. It has neither today.

### Functions

- `save_prd_field(room_id, section_field, value)` — validates the value against
  that field's schema, performs the lazy-cut check, merges into the jsonb, bumps
  `revision`. It takes no base revision: field-level granularity is what makes
  autosave safe for concurrent editors, so two people in different sections
  never collide, and two people in the same field is deliberately
  last-write-wins with nothing to detect.
- `create_prd_section_revise_task(room_id, section_field, instruction,
  quoted_selection, provider)` — mirrors `create_prd_revise_task`'s participant,
  device, provider, and manifest-freezing guards, but takes the instruction
  directly rather than reading it from a message body. A unique partial index on
  `(room_id, section_field)` for active tasks permits parallel requests across
  sections while preventing two racing on one field.
- `apply_prd_proposal(proposal_id)` — permission check, staleness check,
  lazy cut, splice, revision bump, stash previous value, mark applied, insert
  the conversation entry. One transaction, so a change can never exist without
  its history entry.
- `undo_prd_proposal(proposal_id)` — restores the stashed value, bumps
  revision, deletes the conversation entry. It does not unwind a lazy cut that
  Apply may have triggered: that snapshot recorded the settled state, which
  remains the correct history regardless of what happened after it.
- `accept_prd(room_id)` — sets the settle marker. Replaces the terminal,
  irreversible `acceptPrdVersion`.

### Migration

Existing multi-row `prds` data folds into the new shape: the highest version
per room becomes the live row, the remainder become `prd_versions` snapshots.
Where that highest version was already accepted, the live row is marked settled
at its current revision, so it reads as accepted and its next edit cuts the
first lazy snapshot. Otherwise it starts unsettled.

## AI contract

A new task kind `prd_section_revise` joins `room_reply`, `prd_generate`, and
`prd_revise` in `packages/contracts/src/ai.ts`.

The connector receives the whole PRD as context, plus the target section, the
instruction, and the quoted selection. Its structured-output schema has exactly
one slot: the new value for that one field. The model has no channel through
which to change another section — the guarantee is structural, not a diff
checked after the fact. The returned value is parsed against that field's own
schema (a `list` section must return an array of strings, `risks` an array of
risk/mitigation pairs) before a proposal row is written.

The prompt is versioned, as `PRODUCT_AGENT_PROMPT_VERSION` already is, so
changing the wording is a reviewable change.

## UI

New:

- `prd-selection.ts` — pure: resolve a DOM selection to
  `{ sectionField, quotedText }`, or `null` when it spans two sections. The
  single place that decides scope.
- `prd-selection-composer.tsx` — the popover: autofocus, scope chip, quote,
  floating mention overlay, submit.
- `prd-section-diff.ts` — pure: before/after values of a field to renderable
  segments, per section kind (prose by sentence, lists by row). Sibling to the
  document-level `prd-diff.ts`.
- `prd-proposal-card.tsx` — in-section review, with pending, stale, failed, and
  applied-with-Undo states.
- `prd-agent-tray.tsx` — the right rail while open.
- `prd-proposals-provider.tsx` — proposal state, modelled on the existing
  `room-task-status-provider.tsx`. That provider *polls* rather than subscribing
  (`RoomTaskStatusPoller`), and a proposal's progress is task progress, so this
  one polls too: once on mount, then on an interval only while some proposal is
  still pending.

Changed:

- `prd-editor.tsx` shrinks substantially. Its entire draft apparatus —
  `cloneDocument`, `isDirty`, `resetDraft`, `handleSave`, conflict handling, and
  the imperative handle — exists only to serve Save/Cancel, and autosave deletes
  all of it. What remains is a per-field autosaving wrapper around the section
  renderers.
- `prd-header.tsx` loses `EditorActions` and the Save/Cancel branch. Edit
  remains as a mode toggle so the document cannot be typed into by accident.
  The acceptance dialog's copy changes from "acceptance is irreversible" to
  recording a state.

## Failure handling

- **Autosave fails.** The highest-stakes case, because there is no Save button
  to fall back on. The field keeps the local value, an inline "not saved" marker
  appears, and the write retries. Server state never clobbers the input on
  failure.
- **Stale proposal.** The card says the section moved and offers Re-run or
  Discard. Apply is disabled; it cannot half-merge.
- **Task failed** (provider error, timeout, invalid shape). Reason shown in the
  tray with Retry. The document was never touched, so there is nothing to roll
  back.
- **No paired device or authenticated provider.** The composer routes to AI
  setup, as the room composer does today.
- **Viewer permission.** No composer on selection, no Apply.

## Testing

pgTAP carries the load, because the load-bearing rules are database rules:

- the lazy cut fires exactly once per settle point, and never on an unsettled
  edit
- `apply_prd_proposal` writes the change and its conversation entry atomically
- `undo_prd_proposal` restores the prior value and removes the entry
- the one-active-task-per-section index holds
- a viewer cannot apply a proposal
- proposals are tenant-isolated

Unit: selection-to-section resolution including the spans-two-sections
rejection; field diffs per section kind; staleness hashing.

Component: composer appearance, autofocus, and Escape; every proposal card
state; the tray.

E2E, extending the existing `isDiscoveryFakeEnabled()` / `e2e-fake.ts` harness:
highlight → ask → proposal → Apply produces both a changed document and exactly
one compact conversation entry; Discard leaves no trace; accept → edit → the
version appears in history.

## Non-goals

- **Teammate mentions from the PRD.** The composer and the mention list are
  built to accommodate them — selecting a human would post a message to the
  conversation quoting the section, reusing the room conversation rather than
  building anchored comment threads — but the list ships agent-only.
- **Anchored comment threads** on the document.
- **Character-range anchors.** The selection is carried as quoted text in the
  instruction, not as offsets, so nothing depends on an anchor surviving a
  rewrite.
- **Free-text chat in the tray.** Every request originates from a selection and
  therefore has a section. Document-wide changes keep their existing home:
  `@Product Agent` in the conversation, via `prd_revise`.
- **Real-time collaborative text editing.** Two people in the same field is
  last-write-wins.
- **Per-save undo history.** Undo covers applying a proposal; hand edits below a
  settle point have no snapshot floor.
