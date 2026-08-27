# Freeform Document Editor

## Goal

Replace the Document pane's dead empty state and rigid PRD section editor with
one Notion-like writing surface. A person can open an empty Document, type or
paste immediately, format content as blocks, and let Meld generate into the
same freely editable format.

The UI calls this surface **Document**. Existing database, backend, and file
names may continue to use `prd` where changing them would add migration noise
without changing the product behavior.

## Experience

The Document pane remains a white, scrollable work surface inside the existing
Meld pane frame. It does not render an empty-state message or action button.

The top of the document contains the existing actions and metadata:

- Owner
- Version (`v1` for the first draft)
- Status (`Current draft` or `Accepted`)
- Created time (`Not saved yet` before the first successful autosave)
- A compact autosave state: `Saving...`, `Saved`, or `Could not save`

Below the metadata is a borderless title field with the placeholder `New page`,
followed by an immediately writable block body. The body accepts ordinary
typing and copy/paste. The initial caret goes to the title; clicking or pasting
into the body works without first pressing an Edit button.

The first release supports paragraphs, heading levels 1-3, bulleted lists,
numbered lists, checklists, block quotes, code blocks, links, undo, and redo.
Block type is chosen from a menu; formatting commands use familiar icon buttons
with tooltips. Selection formatting may use a compact floating toolbar. Slash
commands are optional follow-up work, not required for the first release.

Read-only participants see the same document layout without a caret or editing
controls. Existing accepted-version and version-history actions remain.

## Editor Foundation

Use Tiptap on ProseMirror for editing, selection, history, paste handling, and
document transforms. Do not hand-roll a `contenteditable` engine. Tiptap's
document schema is restricted to the supported node and mark allowlist; pasted
HTML is sanitized through that schema rather than persisted directly.

The editor uses one canonical JSON document:

```ts
type FreeformDocument = {
  format: "blocks-v1";
  title: string;
  body: {
    type: "doc";
    content?: FreeformNode[];
  };
};
```

Every top-level block carries a stable `meldId` attribute. IDs survive ordinary
edits, moves, autosaves, agent proposals, and history reads. They provide stable
targets for selection assistance and block-aware comparisons.

`PRDDocumentSchema` becomes a union of the current structured legacy shape and
`FreeformDocumentSchema`. New writes always use `blocks-v1`. Runtime validation
limits title length, total JSON size, nesting depth, node count, URLs, node
types, marks, and attribute shapes. Empty titles are allowed; read views,
exports, and filenames fall back to `Untitled` without writing placeholder text
into the editor.

The existing `prds.document` JSONB column remains the storage boundary. No
parallel structured/freeform copies are stored.

## Empty Document And Autosave

Opening an empty Document does not create a database row. The page renders
provisional metadata using the current Room owner, `v1`, `Current draft`, and
`Not saved yet`.

The first meaningful title or body change starts a debounced autosave. The save
transaction creates draft `v1` if the Room still has no document. Later changes
update the current draft in place; editing an accepted version creates the next
draft version, preserving current versioning behavior.

Autosave waits 750 ms after the last content change. Only one save is in flight.
If edits occur during a save, one trailing save sends the newest snapshot. The
editor does not clear local content while saving or after an error.

Save requests carry the current document ID, version, and `updatedAt` revision
token. The database locks the Room and rejects a stale token instead of allowing
two editors to overwrite each other. On conflict, autosave pauses and a compact
banner offers `Load latest` and `Keep my copy`. Keeping the local copy rebases it
against the latest revision and requires an explicit confirmation before save.

Network errors show `Could not save` with a Retry command. Navigation may warn
when a local change has never reached the server; a successful autosave removes
that warning.

## Legacy Documents

Current structured PRDs remain valid stored records. A deterministic adapter
converts their title and ordered sections into supported blocks for reading and
editing:

- prose fields become headings plus paragraphs;
- string arrays become list blocks;
- scope becomes Included and Excluded subheadings with lists;
- risks and mitigations become paired labeled blocks;
- decisions retain rationale and source links as readable blocks;
- a structured user-flow preview becomes a preserved read-only embedded block,
  while prose journeys become ordinary blocks.

Opening a legacy document does not mutate it. Its first successful manual or
agent save writes `blocks-v1`. History can therefore contain both formats, and
all history readers normalize either format before rendering or comparing.

## Meld Generation And Assistance

Meld generation produces Markdown, not a fixed section JSON object. A maintained
Markdown-to-ProseMirror parser converts the response deterministically into the
allowlisted block schema and assigns stable block IDs. The generated outline is
ordinary content: every heading and block can be moved, rewritten, or deleted.

Copy and export perform the inverse block-to-Markdown conversion. The same
conversion path is used for agent context so manual, generated, copied, and
exported content agree.

Agent assistance no longer targets `PRDDocument` field names. A request contains
the selected block IDs, selected text range when present, and a Markdown snapshot
of those blocks. With no selection, the request targets the whole document.
Proposed edits return Markdown plus the target IDs and are previewed before
replacement. Applying a proposal uses the same document revision token as
autosave, so a stale proposal cannot overwrite newer typing.

## Component Boundaries

- `FreeformDocumentEditor`: owns Tiptap, title state, selection, dirty state,
  and editor commands. It emits validated snapshots but does not call the
  backend directly.
- `DocumentAutosaveController`: serializes saves, handles debounce/trailing
  saves, revision conflicts, retries, and first-draft creation.
- `DocumentHeader`: renders actions, metadata, and save state for provisional,
  draft, accepted, and read-only documents.
- `FreeformDocumentViewer`: renders normalized block JSON without editor chrome.
- `legacyPrdToBlocks`: pure deterministic legacy adapter.
- `documentMarkdown`: canonical Markdown import/export for generation, copy,
  export, and agent context.

The existing Room pane decides whether the editor or viewer is interactive from
`canEdit`; the persistence controller decides whether a save creates or updates.

## Failure And Recovery

- Invalid pasted or generated nodes are dropped by the allowlist while their
  textual content is preserved where possible.
- An invalid save response leaves the local snapshot intact and reports failure.
- A stale revision never autosaves over the server document.
- A failed first save keeps provisional metadata and the full local draft.
- Loading an unreadable legacy document shows a non-editable recovery state and
  keeps Copy raw JSON available to administrators; it never writes a blank
  replacement automatically.

## Verification

Focused automated coverage will verify:

- an empty editable Document renders title and body inputs instead of EmptyState;
- typing or pasting creates draft `v1` through one debounced save;
- changes during an in-flight save produce one trailing save;
- read-only participants cannot mutate content;
- supported block formatting round-trips through JSON and Markdown;
- unsafe pasted HTML is not persisted;
- legacy structured fields convert without content loss;
- generated Markdown becomes freely editable blocks;
- revision conflicts preserve local content and pause autosave;
- copy, export, history, acceptance, and agent proposals accept both legacy and
  `blocks-v1` documents during migration.

Only focused Document/PRD suites, contract tests, migration checks, Astryx
conventions, and diff validation are required during implementation. Visual
verification should use the user's existing development server.
