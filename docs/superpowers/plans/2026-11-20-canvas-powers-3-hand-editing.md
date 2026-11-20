# Canvas powers hand editing implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit the live screen from its source or a picked element, preview changes, undo edits, export the original files and save versioned drafts.

**Architecture:** The editor runs beside the compiler in its module worker. A board-owned draft registry coordinates source revisions, saves, picks and document replacement across screen switches. The right panel consumes that registry and the existing live controller.

**Tech stack:** TypeScript, React 19, CodeMirror 6, Babel standalone 7, parse5 7.3, Astryx 0.1.8, Supabase/Postgres, Vitest and Playwright.

## Revision status — 20 November 2026

This revision incorporates the seven findings from the Plan 3 preflight. The executable baseline is the completed Plan 2 branch, currently `0e6592be` in `canvas-powers-live-paste`; this document lives in `tegucigalpa` for review. This workspace does not yet contain Plan 2. Do not implement against its older application files or copy whole worktrees over unrelated changes. At execution, verify the Plan 2 tip and use its existing branch/worktree unless directed otherwise; do not rename this branch.

The **Preflight closure implementation sheets** below are required parts of H3–H9. They supply definitions and regression cases used by the earlier sheets, and take precedence where they make earlier prose more specific. This is a planning revision only: no migration, application change or runtime test is being delivered with it. H1/H4 shared schema application retains its separate review gate.

## Global Constraints

Use the approved [design](../specs/2026-11-19-canvas-powers-design.md) §§3,5 and the [live and paste plan](2026-11-20-canvas-powers-2-live-and-paste.md) as the baseline. Branch from the completed Plan 2 tip. For this Mac use `export PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH"`. New chrome uses Astryx components/tokens, no raw layout div/span, hex/px styling or shadows. Keep the existing 280 px end panel and board panning. Pin Excalidraw 0.18.1. Keep FRAME_CSP, FRAME_SANDBOX, BOARD_FRAME_CSP and scriptless BOARD_FRAME_SANDBOX. One live iframe, 1000 ms loop guard, 5000 ms ready deadline, 200000-character snapshot limit. Keep the existing React import allowlist. Source has 1–20 files, at most 262144 UTF-8 JSON bytes and 100 links. Copy and download use authored source. Only live compiled documents receive injected source tags. Database changes require separate schema review before application. No shared DB writes, resets, deploys or Plan 4 chat delivery.

Carried from Plan 1 (unchanged):
- Astryx rules from `AGENTS.md`:
  - no raw `<div>` / `<span>` (an `<iframe>` is fine, as in `FrameHost`)
  - no hex values or `NNpx` literals in `style={{}}` or CSS rules; numbers passed to component props (`width={280}`) are fine
  - tokens only: `var(--color-*)`, `var(--spacing-*)`, `var(--radius-*)`
  - `pnpm check:astryx` must pass
- Flat rule: no drop shadows on new chrome. Depth comes from surface colour only.
- `@excalidraw/excalidraw` stays pinned at `0.18.1`.
- Screen frame network policy is unchanged. `FRAME_CSP` in `apps/web/src/features/canvas-excalidraw/frame-document.ts` stays the single source of the live CSP: no network. Board thumbnails keep `BOARD_FRAME_CSP` and `BOARD_FRAME_SANDBOX` (`""`, no scripts).
- Screen source limits: 1 to 20 files; at most 256 KB total (UTF-8 JSON); paths match `^[A-Za-z0-9_][A-Za-z0-9_./-]{0,119}$` and never contain `..`; at most 100 links.
- Supported React imports, exactly: `react`, `react/jsx-runtime`, `react-dom`, `react-dom/client`, `lucide-react`, `clsx`, plus relative imports of the screen's own `.tsx .ts .jsx .js .css` files.
- Element tag attribute `data-orion-src="<file>:<start>:<end>"`; tags only when `tagElements: true` (the live host compiles with tags on; they never reach a snapshot, copy or download).
- Loop guard: a single synchronous loop run longer than **1000 ms** throws `new Error("__ORION_STUCK__")`.
- Database writes to screen versions happen only through security-definer RPCs. H1 hardens the existing Plan 1 save RPC; H4 adds an editor-authorized, idempotent board conversion RPC. Both migrations require the separate schema review before application.
- Tests sit next to the files they test (`pnpm test:colocation`). A facet test `name.facet.test.ts` is allowed when `name.ts` sits beside it.

Carried from Plan 2:
- Live frame: `sandbox="allow-scripts"` (`FRAME_SANDBOX`), `pointer-events: auto`, accent outline `var(--spacing-0-5) solid var(--color-accent)`. Only one live screen at a time.
- Ready timeout: **5000 ms** from document mount to the bridge's `ready`. `ready` means "the document finished loading", never "no errors".
- Board screen HTML (thumbnails/snapshots) stays ≤ **200 000** characters, the existing `board-persistence.ts` limit. A larger snapshot is dropped, never stored (an oversized screen would make every board save fail).
- Snapshots are taken only for screens whose source lives in the screen store (`kind` `react`/`html`). Board-only and legacy screens keep their stored HTML untouched, because the "Preview screen" route runs that HTML with its scripts.
- Copy is user-facing and plain: "This screen stopped responding", "Reload", "Show code", "Open live", "Code", "Paste code".

Plan 3 adds a 600 ms code-compile debounce and 2 s idle save, with immediate preview on Tweak and immediate flush request on sleep. Exact panel copy includes **Tweak**, **Pick**, **Code**, **Copy**, **Download**, **Undo**, **Redo**, **Add to chat** and **Reload latest**.

## File map and execution order

Paths below use `R=packages/screen-runtime/src`, `L=apps/web/src/features/canvas-excalidraw/live`, `B=apps/web/src/features/canvas-excalidraw`, `D=apps/web/src/features/design`. Tests are colocated, except Supabase pgTAP and browser specs. The execution sequence is H1 → H2a/H2b/H2c → H3 → H2d → H4 → H5 → H6 → H7 → H8a/H8b/H8c → H9. H2/H8 are shared contracts for their subtasks. The implementation sheets within each task provide the code and red tests. H4/H5 share one persistence-adapter contract. Each task owns its named files. Start each task with the red test, implement, rerun the same target and review its diff before committing only its listed files.

**Build order, files and review gates**

| Gate | Exact files in addition to tests named in the brief |
| --- | --- |
| H1 | `supabase/migrations/20261120100000_canvas_screen_hand_edit_guards.sql`, `supabase/tests/canvas_screen_source.test.sql`, `D/canvas-screen-source-fake.ts`, `D/canvas-screen-source-fake.test.ts`, `D/canvas-screen-source.test.ts` |
| H2a | `R/edit/types.ts`, `R/edit/style.ts`, `R/edit/style.test.ts` |
| H2b | `R/edit/patch.ts`, `R/edit/html.ts`, `R/edit/html.test.ts`, `packages/screen-runtime/package.json`, `pnpm-lock.yaml` |
| H2c | `R/edit/jsx.ts`, `R/edit/jsx.test.ts`, `R/edit/index.ts`, `R/edit/index.test.ts`, `packages/screen-runtime/package.json` |
| H3 | `L/source-protocol-types.ts`, `L/compile-protocol.ts`, `L/compile-protocol.test.ts`, `L/compile.worker.ts`, `L/screen-compiler.ts`, `L/screen-compiler.test.ts`, `L/inline-compiler.ts`, `L/inline-compiler.test.ts`, `L/live-messages.ts`, `L/live-messages.test.ts`, `L/live-controller.ts`, `L/live-controller.test.ts`, `R/runtime/bridge.ts`, `R/runtime/bridge.test.ts` |
| H2d | `L/screen-compiler.bundle.test.ts`, `R/edit/index.test.ts`, `apps/web/package.json`, `pnpm-lock.yaml` |
| H4 | `supabase/migrations/20261120100100_canvas_screen_board_conversion.sql`, `supabase/tests/canvas_screen_source.test.sql`, `D/canvas-screen-source.ts`, `D/canvas-screen-source.test.ts`, `D/canvas-screen-source-fake.ts`, `D/canvas-screen-source-fake.test.ts`, `L/live-source.ts`, `L/live-source.test.ts`, `L/edit-target.ts`, `L/edit-target.test.ts`, `B/design-screen-board.ts`, `B/design-screen-board.test.ts` |
| H5 | `L/edit-draft.ts`, `L/edit-draft.test.ts`, `L/draft-registry.ts`, `L/draft-registry.test.ts`, `L/live-controller.ts`, `L/live-controller.test.ts` |
| H6 | `R/compile.ts`, `R/compile.test.ts`, `L/live-state.ts`, `L/live-state.test.ts`, `L/live-controller.ts`, `L/live-controller.test.ts`, `B/frame-host.tsx`, `B/frame-host.test.tsx` |
| H7 | `L/code-editor.tsx`, `L/code-editor.test.tsx`, `L/source-export.ts`, `L/source-export.test.ts`, `L/live-panel.tsx`, `L/live-panel.test.tsx`, `apps/web/package.json`, `pnpm-lock.yaml` |
| H8a | `L/tweak-panel.tsx`, `L/tweak-panel.test.tsx` |
| H8b | `L/element-session.ts`, `L/element-session.test.ts` |
| H8c | `L/hand-edit-panel.tsx`, `L/hand-edit-panel.test.tsx`, `L/live-panel.tsx`, `L/live-panel.test.tsx`, `B/excalidraw-board.tsx` |
| H9 | `e2e/canvas-excalidraw-live.spec.ts` (existing browser helpers from Plan 2 P4), `D/canvas-screen-source-fake.hand-edit.test.ts`, `D/canvas-screen-source-fake.ts`, `D/canvas-screen-source-test-actions.ts`, `apps/web/src/app/dev/canvas-excalidraw/page.tsx` and its existing `window.__orionBoard` interface declaration |

**Public type ownership:** `R/edit/types.ts` exports Field, Tweak, Files, EditResult, FieldState and Inspection. `R/edit/patch.ts` exports Patch, Binding, Bindings, EditableNode, descriptor and spliceAt. `R/edit/html.ts` and `R/edit/jsx.ts` export `locateHtml(source:string,range:Range):EditableNode|null` and `locateJsx(source:string,range:Range):EditableNode|null` respectively. Declare/export Range in edit/types.ts. `R/edit/index.ts` exports applyTweak and inspectElement. `L/source-protocol-types.ts` supplies SourceRequest/SourceReply; compile-protocol exports perform and `handleSourceRequest(data:unknown):SourceReply|null`; update compile.worker.ts to invoke handleSourceRequest. `L/screen-compiler.ts` exports ScreenCompiler/createScreenCompiler/createWorkerCompiler and imports protocol *types only*. `L/edit-target.ts` exports EditTarget, persistDraft, createVersionWriter. `L/edit-draft.ts` exports DraftStatus, DraftState, Draft, createEditDraft, Write and Read. `L/draft-registry.ts` exports createDraftRegistry. All worker/board data is structured-clone-compatible. Application imports use `import type` for contracts. Each code sample's local short type aliases refer to these types.

### H1. Protect version writes while generation holds the screen

**Files:** New migration generated by `supabase migration new canvas_screen_hand_edit_guards`; extend `supabase/tests/canvas_screen_source.test.sql`, `D/canvas-screen-source-fake.ts` and its existing action tests. Preserve the exact six-argument save RPC, JSON response, security-definer authorization, grants and empty search_path. Plan 4 owns AI event creation.

- [ ] Extend existing pgTAP fixtures under authenticated editor with explicit base and verify invalid elements (`ARRAY[NULL]::text[]`, upper case, empty, 65 characters, newline), 101 items and a multidimensional array cannot write. Assert a busy screen with a matching base returns conflict, leaves updating true, head and version count untouched; idle + correct base saves, stale base conflicts. Also cover foreign room, deleted screen and anon privileges. Update pgTAP plan count. Run the original and added cases in a branch-pure disposable scratch database using the Plan 1 schema-only recipe as supabase_admin. Record red output.
- [ ] Put the following definition in `supabase/migrations/20261120100000_canvas_screen_hand_edit_guards.sql`. Create the file with the repository Supabase CLI and rename its generated timestamp to the reserved plan timestamp after checking for a collision.

```sql
create or replace function public.save_canvas_screen_version(
  target_screen_id uuid,
  base_version uuid,
  new_files jsonb,
  new_links text[] default '{}',
  new_kind text default null,
  new_entry text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  screen public.design_screens;
  current_version public.design_screen_versions;
  next_kind text;
  next_entry text;
  inserted public.design_screen_versions;
begin
  select * into screen
  from public.design_screens
  where id = target_screen_id and deleted_at is null
  for update;
  if screen.id is null or not public.can_edit_room(screen.room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if screen.updating or screen.current_version_id is distinct from base_version then
    return jsonb_build_object('status', 'conflict', 'versionId', screen.current_version_id);
  end if;

  select * into current_version
  from public.design_screen_versions
  where id = screen.current_version_id;

  next_kind := coalesce(new_kind, nullif(current_version.source_kind, 'legacy'));
  next_entry := coalesce(new_entry, current_version.entry);
  if next_kind is null or next_kind not in ('html', 'react')
    or not public.canvas_screen_files_valid(new_files, next_entry)
    or cardinality(coalesce(new_links, '{}')) > 100
    or coalesce(array_ndims(new_links), 1) <> 1
    or exists (select 1 from unnest(new_links) x(key)
               where key is null or key !~ '^[a-z][a-z0-9_-]{0,63}$')
  then
    raise exception 'invalid_canvas_screen' using errcode = 'P0001';
  end if;

  insert into public.design_screen_versions (
    screen_id, room_id, markup, styles, script, actions_json,
    source_kind, files, entry, links, base_version_id, promoted, created_by
  ) values (
    screen.id, screen.room_id, '', '', null, '[]'::jsonb,
    next_kind, new_files, next_entry, coalesce(new_links, '{}'), base_version, true, auth.uid()
  )
  returning * into inserted;

  update public.design_screens
  set current_version_id = inserted.id, state = 'built', updated_at = now()
  where id = screen.id;

  return jsonb_build_object('status', 'saved', 'versionId', inserted.id);
end;
$$;
revoke all on function public.save_canvas_screen_version(uuid, uuid, jsonb, text[], text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.save_canvas_screen_version(uuid, uuid, jsonb, text[], text, text)
  to authenticated;
```

- [ ] With scratch URL explicitly selected, run `psql -X -v ON_ERROR_STOP=1 "$SCRATCH_DB_URL" -f "$(find supabase/migrations -name '*_canvas_screen_hand_edit_guards.sql')"` and `PGOPTIONS='-c search_path=public,extensions' pg_prove --dbname "$SCRATCH_DB_URL" supabase/tests/canvas_screen_source.test.sql`. In two scratch psql sessions lock the existing fixture in transaction A, mark it updating, issue save in B then commit A; B must return conflict. Run the fake action cases with `pnpm --filter @meld/web test canvas-screen-source`. Submit migration diff and scratch transcript for separate schema review; no apply to shared infrastructure. Commit `fix: serialize manual screen saves with generation`.

### H2. Inspect and rewrite exact literals in the worker

**Files:** Create `R/edit/types.ts`, `R/edit/index.ts`, `R/edit/html.ts`, `R/edit/jsx.ts`, `R/edit/style.ts` and colocated tests. Expose package subpaths `/edit` (worker only) and `/edit/types` (type-only). Use the same UTF-16 offsets and exact full-node bounds as compile.ts and tag-elements.ts.

```ts
export type Field = "text" | "color" | "backgroundColor" | "fontSize" | "fontWeight" | "padding" | "gap" | "borderRadius" | "width" | "height";
export type Tweak = {field: Field; value: string};
export type Files = Record<string,string>;
export type EditResult = {ok:true; files: Files} | {ok:false; reason:"not-found"|"not-literal"};
export type FieldState = {editable:boolean; value:string|null};
export type Inspection = Record<Field,FieldState> | null;
// exports
declare function inspectElement(files:Files, src:string):Inspection;
declare function applyTweak(files:Files, src:string, tweak:Tweak):EditResult;
```

- [ ] Start a matrix for HTML, JSX, TSX and multi-file input. For `const files={"index.html":"<b>Hello</b>"}`, assert `applyTweak(files,"index.html:0:12",{field:"text",value:"A & B"})` returns `{ok:true,files:{"index.html":"<b>A &amp; B</b>"}}`. Assert the original is unchanged. Cover identical siblings, astral text, comments, unrelated bytes, stale span, same-start wrong end, missing own key, invalid syntax, nested text, computed values/spreads, duplicate keys, escaped braces/quotes and every field. Run `pnpm --filter @meld/screen-runtime test src/edit` red.
- [ ] Use parse5 sourceCodeLocationInfo for HTML and the Babel standalone parser with parserOpts matching links.ts, no emit, JSXElement visitor. Require own file, accepted extension, intrinsic node, exact start/end, and editable content. Replace only the original source slices, retaining every other byte. Require one literal text child; encode HTML entities or use a safely escaped JSX literal string expression. Recognize that generated string literal on subsequent picks. Treat ambiguous mixed children, raw-text elements and dynamic expressions as unavailable. For CSS attributes tokenize declarations respecting quotes, comments and parentheses; ambiguous or duplicate declarations disable that property.
- [ ] Validate hex to six digits, numeric lengths as finite nonnegative pixel values, font weights as 100–900 by 100. Keep the fixed Tailwind families `text-[#rrggbb] bg-[#rrggbb] text-[Npx] font-{thin,extralight,light,normal,medium,semibold,bold,extrabold,black} p-[Npx] gap-[Npx] rounded-[Npx] w-[Npx] h-[Npx]`. Classify font size separately from text colour; preserve variants, arbitrary unrelated values and custom classes. Replace only unprefixed tokens for the selected property. Where literal classes have no recognized utility, merge into literal HTML style/JSX object or insert it. Decline computed classes/styles, JSX spreads, dynamic keys and CSS/JS values whose ownership is ambiguous. Expose editability per field. Validate full result with ScreenFilesSchema before replacing draft. Re-run matrix green and commit `feat: rewrite picked source literals without reformatting files`.

#### H2 execution tasks

Execute H2a–H2d with separate red/green cycles and commits. H2 is the shared contract and acceptance matrix. Implement the syntax-neutral style rules before attaching both parsers.

### H2a. Validated style values and Tailwind replacement

**Files:** `R/edit/types.ts`, `R/edit/style.ts`, `R/edit/style.test.ts`. **Produces:** `cssValue(tweak):string|null`, `changeUtility(className,tweak):string|null`. A null class result selects the literal-style fallback. In this task export its local Field/Tweak contracts from edit/types.ts; H2b creates patch.ts. Scope utility detection conservatively to recognized unprefixed tokens and keep all variants untouched.

- [ ] Write this failing unit test, then run `pnpm --filter @meld/screen-runtime test src/edit/style.test.ts`.

```ts
it("distinguishes colour from size without disturbing variant utilities", () => {
  const css="flex text-sm text-red-500 hover:text-blue-500";
  expect(changeUtility(css,{field:"color",value:"#abcdef"}))
    .toBe("flex text-sm text-[#abcdef] hover:text-blue-500");
  expect(changeUtility(css,{field:"fontSize",value:"21"}))
    .toBe("flex text-[21px] text-red-500 hover:text-blue-500");
});
it("declines CSS fragments and preserves custom class handling", () => {
  expect(cssValue({field:"padding",value:"1px; color:red"})).toBeNull();
  expect(changeUtility("billing-summary",{field:"width",value:"32"})).toBeNull();
});
```

- [ ] Implement value validation and family selection with the following table in style.ts. Preserve whitespace by replacing token slices in right-to-left order. Remove additional conflicting tokens only in the same family and at base scope. Resolve bracket colour vs size using the explicit hex, colour function, length-unit or type hint. A utility like `text-center` is unrelated to either family. Use the fixed mapping from H2.

```ts
const weights = ["thin","extralight","light","normal","medium","semibold","bold","extrabold","black"];
const families = {color:"text",backgroundColor:"bg",fontSize:"text",fontWeight:"font",
  padding:"p",gap:"gap",borderRadius:"rounded",width:"w",height:"h"} as const;
export function cssValue(t:{field:Field;value:string}):string|null {
  if (t.field==="text") return null;
  if (t.field==="color" || t.field==="backgroundColor")
    return /^#[0-9a-f]{6}$/i.test(t.value) ? t.value.toLowerCase() : null;
  if (t.field==="fontWeight") return /^[1-9]00$/.test(t.value) ? t.value : null;
  return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(t.value) && Number.isFinite(Number(t.value))
    ? String(Number(t.value))+"px" : null;
}
function utilityFor(t:Tweak):string|null {
  const v=cssValue(t);
  if (t.field==="text" || v===null) return null;
  if (t.field==="fontWeight") return "font-"+weights[Number(v)/100-1];
  return families[t.field]+"-["+v+"]";
}
const colorPart=/^(?:transparent|current|inherit|black|white|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|[1-9]00|950)|\[(?:#|color:|rgb\(|hsl\(|oklch\().+\])(?:\/[0-9]+)?$/;
function family(token:string):Field|null {
  if(token.startsWith("text-")){
    const v=token.slice(5);
    if(colorPart.test(v)) return "color";
    if(/^(?:xs|sm|base|lg|xl|[2-9]xl|\[(?:length:)?[\d.]+(?:px|r?em|%)\])$/.test(v)) return "fontSize";
  }
  if(token.startsWith("bg-") && colorPart.test(token.slice(3))) return "backgroundColor";
  if(token.startsWith("font-") && weights.includes(token.slice(5))) return "fontWeight";
  if(/^rounded(?:-(?:none|xs|sm|md|lg|xl|[2-4]xl|full|\[[^\]]+\]))?$/.test(token)) return "borderRadius";
  const m=/^(p|gap|w|h)-(?:[\d.]+(?:\/[\d.]+)?|auto|full|screen|px|fit|min|max|\[[^\]]+\])$/.exec(token);
  return m ? ({p:"padding",gap:"gap",w:"width",h:"height"} as const)[m[1] as "p"|"gap"|"w"|"h"] : null;
}
export function changeUtility(className:string,t:Tweak):string|null {
  const desired=utilityFor(t); if(!desired) return null;
  const tokens=Array.from(className.matchAll(/\S+/g));
  const known=tokens.some(([token])=>family(token)!==null ||
    /^(?:flex|grid|block|inline|inline-block|inline-flex|hidden|items-center|justify-center)$/.test(token));
  if(!known) return null;
  let seen=false;
  const output=className.replace(/\S+/g,token=>{
    if(family(token)!==t.field) return token;
    if(seen) return "";
    seen=true; return desired;
  });
  return seen ? output : output+(output.endsWith(" ")?"":" ")+desired;
}
```

- [ ] Verify green; commit `feat: classify literal Tailwind tweak properties`.

### H2b. Source-span discovery and literal HTML rewrites

**Files:** `R/edit/html.ts`, `R/edit/html.test.ts`. **Produces:** one parse5 visitor resolving `{file,start,end}` into an exact authored HTML element; source ranges for text and attributes, with a syntax-neutral descriptor used by inspection. Reject synthetic nodes and unsupported file positions.

- [ ] Use this exact red test and compare source bytes around the target after editing.

```ts
it("preserves a sibling and escapes the selected HTML text", () => {
  const before="<p>😀</p><p>Hello</p>";
  const offset=before.indexOf("<p>Hello");
  const files={"index.html":before};
  const node=locateHtml(files["index.html"],{file:"index.html",start:offset,end:before.length});
  const patch=node!.patch({field:"text",value:"<A&B>"});
  expect(spliceAt(before,patch!)).toBe("<p>😀</p><p>&lt;A&amp;B&gt;</p>");
});
```

- [ ] Reuse parse5's typed DefaultTreeAdapterMap and the tree traversal pattern in compile.ts. Match location.startOffset and endOffset before exposing attribute/text locations. For text require a single #text child with sourceCodeLocation and a normal text parent; decline raw-text and RCDATA elements. A style or class edit replaces only the attribute's value when possible or inserts at the original start tag close; escape whichever delimiter is used. Use double-quoted serialization for unquoted attributes. Preserve surrounding whitespace/comments by splicing source, not serializing the entire parsed page.

```ts
type Patch = {from:number;to:number;value:string};
export function spliceAt(source:string,p:Patch) {
  return source.slice(0,p.from)+p.value+source.slice(p.to);
}
export function htmlText(value:string) {
  return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}
export function quotedHtmlAttribute(value:string) {
  return '"'+htmlText(value).replaceAll('"',"&quot;")+'"';
}
export function putAttribute(source:string, startTagEnd:number, existing:Patch|null, name:string,value:string) {
  if(existing) return spliceAt(source,{...existing,value:name+"="+quotedHtmlAttribute(value)});
  const offset=source[startTagEnd-2]==="/" ? startTagEnd-2 : startTagEnd-1;
  return spliceAt(source,{from:offset,to:offset,value:" "+name+"="+quotedHtmlAttribute(value)});
}
```

- [ ] Test unquoted attribute, quoted CSS url with semicolon, duplicate declarations, comments, unrelated formatting, inline style fallback and CRLF. Run `pnpm --filter @meld/screen-runtime test src/edit/html.test.ts`; commit `feat: apply literal tweaks to HTML source ranges`.

### H2c. Literal JSX rewrites and guarded source API

**Files:** `R/edit/jsx.ts`, `R/edit/index.ts`, colocated tests and package exports. **Consumes:** H2a style rules; H2b shared splice. **Produces:** H2 public worker-only edit functions.

- [ ] Run the following cases on an exact selected JSX range. Include computed className, style identifier, spread, nested JSX and mixed text.

```ts
it.each(["<b>{name}</b>", "<b>Hello {name}</b>", "<b><i>Hi</i></b>"])(
  "declines computed or mixed text in %s",element=>{
    const prefix="export default () => ";
    const file=prefix+element;
    expect(applyTweak({"App.tsx":file},"App.tsx:"+prefix.length+":"+file.length,
      {field:"text",value:"plain"})).toEqual({ok:false,reason:"not-literal"});
  });
it("rewrites JSX text with braces as a safely quoted literal",()=>{
  const prefix="export default () => ";
  const file=prefix+"<b>ok</b>";
  const value='Click {here} & "say"';
  expect(applyTweak({"App.tsx":file},"App.tsx:"+prefix.length+":"+file.length,
    {field:"text",value})).toEqual({ok:true,files:{"App.tsx":prefix+"<b>{"+JSON.stringify(value)+"}</b>"}});
});
```

- [ ] Use Babel standalone transform with code:false, an explicit parserOpts and a visitor matching JSXElement by exact node.start/end. Reject components/fragments, spreads and duplicate property assignments. Work with source slices instead of Babel generator. JSX text replacement `"{"+JSON.stringify(value)+"}"` is a string-literal expression on the next inspection; accept precisely that expression type alongside JSXText. For an object literal style, reject spreads, computed keys and non-literal values in the target; use Babel's original key and value range so remaining object/comment formatting survives. Add a missing property before the closing brace, accounting for existing trailing comma/comments with parsed property positions; embed new style as `style={{color:"#abcdef"}}` using serialized validated CSS values. Treat numeric weights as CSS numbers or string weights consistently.

```ts
export function applyTweak(files:Files,src:string,tweak:Tweak):EditResult {
  const tag=parseTag(src);
  if(!tag || !Object.hasOwn(files,tag.file) || tag.start>=tag.end || tag.end>files[tag.file].length)
    return {ok:false,reason:"not-found"};
  const node=locate(files,tag); // locate selects html/JSX parser by file; parse errors resolve to null
  if(!node) return {ok:false,reason:"not-found"};
  const patch=node.patch(tweak); // descriptor returns null when literal ownership is ambiguous
  if(!patch) return {ok:false,reason:"not-literal"};
  return {ok:true,files:{...files,[tag.file]:spliceAt(files[tag.file],patch)}};
}
export type EditableNode = {
  inspect():Record<Field,FieldState>;
  patch(tweak:Tweak):Patch|null;
};
```

- [ ] Use same descriptor inspection for preflight (each unsupported field marked disabled). Run `pnpm --filter @meld/screen-runtime test src/edit`; commit `feat: edit JSX literals using their tagged source spans`.

#### Parser implementation details for H2b/H2c

Prefer `packages.parser.parse` and `packages.traverse.default` from the installed Babel standalone package; its typings expose both already. Pass a parserOpts plugin list that matches compileReact's filename. Worker code alone imports these. The following lookup is deliberately exact: do not select the nearest node when parsing an old byte range. parse5 nodes created by its parser without a source location cannot be picked. When reading decimal source offsets guard that the supplied tag is fully consumed; use existing parseTag. Tree visitor returns a descriptor created from the matched node; descriptor.patch returns a single Patch against the *original* document. Matching a repeated JSX element rendered from mapped data identifies one authored source node shared by those instances.

```ts
import {packages} from "@babel/standalone";
import type {types as t} from "@babel/core";
import {parse, type DefaultTreeAdapterMap} from "parse5";
type Range={file:string;start:number;end:number};
type HNode=DefaultTreeAdapterMap["node"];
type HElement=DefaultTreeAdapterMap["element"];
function findHtml(source:string,range:Range):HElement|null {
  const doc=parse(source,{sourceCodeLocationInfo:true});
  const pending:HNode[]=[doc];
  while(pending.length) {
    const n=pending.pop()!;
    if("tagName" in n && n.sourceCodeLocation?.startOffset===range.start &&
        n.sourceCodeLocation.endOffset===range.end) return n;
    if("childNodes" in n) pending.push(...n.childNodes);
  }
  return null;
}
function findJsx(source:string,r:Range):t.JSXElement|null {
  const ast=packages.parser.parse(source,{sourceType:"unambiguous",
    plugins:/\.tsx?$/.test(r.file)?["jsx","typescript"]:["jsx"]});
  let found:t.JSXElement|null=null;
  packages.traverse.default(ast,{JSXElement(path){
    const n=path.node,name=n.openingElement.name;
    if(name.type==="JSXIdentifier" && /^[a-z]/.test(name.name) &&
      n.start===r.start && n.end===r.end) {found=n;path.stop();}
  }});
  return found;
}
```

A descriptor can build values and patches through per-field closures. Preserve a clear separation between “no explicit authored value” (editable blank) and “computed, cannot edit” (disabled). `inspectElement` and `applyTweak` use the *same* closure table. For React omit JSX AST nodes with missing source locations. Explicit style attributes override base utility classes in the CSS cascade: when both literals conflict for the selected property and replacing the class would leave a different inline value taking priority, disable the ambiguous property rather than claiming the preview changed. Preserve unrelated style objects and text expressions.

```ts
type Binding={value:string|null;make:(input:string)=>Patch|null};
type Bindings=Record<Field,Binding|null>;
const fields:Field[]=["text","color","backgroundColor","fontSize","fontWeight","padding","gap","borderRadius","width","height"];
function descriptor(bindings:Bindings):EditableNode {
  return {
    inspect:()=>Object.fromEntries(fields.map(field=>{
      const p=bindings[field];
      return [field,{editable:p!==null,value:p?.value??null}];
    })) as Record<Field,FieldState>,
    patch:({field,value})=>bindings[field]?.make(value)??null
  };
}
function textInJsx(node:t.JSXElement):Binding|null {
  if(node.children.length!==1) return null;
  const child=node.children[0];
  const string=child.type==="JSXText"?child.value:
    child.type==="JSXExpressionContainer" && child.expression.type==="StringLiteral"?child.expression.value:null;
  if(string===null || child.start==null || child.end==null) return null;
  const from=child.start,to=child.end;
  return {value:string,make:text=>({from,to,value:"{"+JSON.stringify(text)+"}"})};
}
function textInHtml(node:HElement):Binding|null {
  if(["style","script","textarea","title","xmp","plaintext","noscript","iframe"].includes(node.tagName)
     || node.childNodes.length!==1) return null;
  const child=node.childNodes[0];
  if(child.nodeName!=="#text" || !("value" in child) || !child.sourceCodeLocation) return null;
  const {startOffset:from,endOffset:to}=child.sourceCodeLocation;
  return {value:child.value,make:text=>({from,to,value:htmlText(text)})};
}
function jsxAttribute(node:t.JSXElement,name:string):t.JSXAttribute|null|undefined {
  const attrs=node.openingElement.attributes;
  if(attrs.some(a=>a.type==="JSXSpreadAttribute")) return undefined;
  const matches=attrs.filter((a):a is t.JSXAttribute=>a.type==="JSXAttribute"
    && a.name.type==="JSXIdentifier" && a.name.name===name);
  return matches.length>1?undefined:matches[0]??null;
}
function objectStyle(obj:t.ObjectExpression,field:Field):Binding|null {
  const properties=obj.properties;
  if(properties.some(p=>p.type!=="ObjectProperty" || p.computed)) return null;
  const hits=properties.filter((p):p is t.ObjectProperty=>p.type==="ObjectProperty" &&
    ((p.key.type==="Identifier" && p.key.name===field)||(p.key.type==="StringLiteral" && p.key.value===field)));
  const old=hits[0];
  if(hits.length>1 || (old && (old.value.type!=="StringLiteral" && old.value.type!=="NumericLiteral"))) return null;
  if(old && (old.value.type==="StringLiteral" || old.value.type==="NumericLiteral")){
    const from=old.value.start,to=old.value.end;
    if(from==null || to==null) return null;
    return {value:String(old.value.value).replace(/px$/,""),make:input=>{
      const value=cssValue({field,value:input});
      return value===null?null:{from,to,value:JSON.stringify(value)};
    }};
  }
  // Insert before the first property, avoiding trailing commas and end-of-object comments.
  const at=properties.length?properties[0].start:obj.start!=null?obj.start+1:null;
  if(at==null) return null;
  return {value:null,make:input=>{
    const value=cssValue({field,value:input});
    return value===null?null:{from:at,to:at,value:field+":"+JSON.stringify(value)+(properties.length?", ":"")};
  }};
}
```

If JSX has no style attribute, append immediately after the last existing attribute or element name, leaving the author’s whitespace before `/>` untouched. Serialize source strings with JSON.stringify inside JSX expression containers rather than quote unescaped strings in attribute syntax. If className is a StringLiteral or a JSX expression containing a StringLiteral, the utility rewrite replaces that *value range* with `{JSON.stringify(newClass)}` assembled as `"{"+JSON.stringify(newClass)+"}"` (includes literal brace characters); no arbitrary expression is evaluated. Reject computed styles/classes before taking utility fallback. Reject CSS variables/expressions for target declarations if their explicit value could be dynamic; valid fixed-length/hex computed display is independent of parsed literal ownership.

For HTML inline styles use the workspace-pinned parser version as a direct worker dependency by running `pnpm --filter @meld/screen-runtime add -E postcss@8.5.23`. Add its package to the same board bundle exclusion check. Wrap the style attribute value in one rule for declaration parsing, test that root contains exactly one rule and every child is a declaration or comment, then replace only that property in the parsed rule's authored string. PostCSS preserves raw spacing, comments and value separators (including quoted semicolons) through its lossless toString. HTML encoding may normalize entities **within the one touched attribute**; all bytes elsewhere in the document stay unchanged. Verify at build time that worker compilation resolves PostCSS's browser build with no node filesystem dependency.

```ts
import postcss,{type Declaration} from "postcss";
const cssNames:Partial<Record<Field,string>>={backgroundColor:"background-color",fontSize:"font-size",
  fontWeight:"font-weight",borderRadius:"border-radius"};
function editStyleAttribute(css:string,t:Tweak):string|null {
  const value=cssValue(t); if(value===null) return null;
  const prop=cssNames[t.field]??t.field;
  try{
    const root=postcss.parse("x{"+css+"}",{from:undefined});
    const rule=root.first;
    if(root.nodes.length!==1 || rule?.type!=="rule" || rule.selector!=="x" ||
      rule.nodes.some(n=>n.type!=="decl" && n.type!=="comment")) return null;
    const hits=rule.nodes.filter((n):n is Declaration=>n.type==="decl" && n.prop.toLowerCase()===prop);
    if(hits.length>1 || (hits[0] && /(?:var|env|calc)\(/i.test(hits[0].value))) return null;
    if(hits[0]) hits[0].value=value; else rule.append({prop,value});
    const wrapped=rule.toString();
    return wrapped.slice(2,-1);
  }catch{return null;}
}
```

**Targeted tests:** source-matched style edits for `className={active?'a':'b'}`, `style={theme}` and `style={{...theme}}` return not-literal; `style={{lineHeight:1.5,width:20}}` retains lineHeight unchanged when width becomes 48px; escaped string expression round-trips twice with successive picks. Test line comments before the last property, same line comma placement, and computed className with literal style (disabled). Add a class fallback case where `text-sm text-red-500` becomes `text-sm text-[#112233]` and foreground colour stays unchanged when font size is changed next.

### H2d. Worker dependency boundary and exact-range parity

**Files:** `R/edit/index.test.ts`, `packages/screen-runtime/package.json`, `L/screen-compiler.bundle.test.ts`. Run this gate **after H3**, so the production client has separated its test-only inline adapter. Confirm both HTML and JSX tags minted by compiler resolve to exactly their authored elements, including astral offsets. Board main imports edit/types via type-only statements. Set exports "./edit" and "./edit/types" without changing existing package root. This gate follows H3 transport implementation if it requires a concrete client method.

```ts
import {build} from "esbuild";
import {fileURLToPath} from "node:url";
it("keeps source parser implementations out of the browser client graph",async()=>{
  const entry=fileURLToPath(new URL("./screen-compiler.ts",import.meta.url));
  const result=await build({entryPoints:[entry],bundle:true,platform:"browser",format:"esm",metafile:true,write:false});
  expect(Object.keys(result.metafile.inputs).filter(p=>
    /@babel\/standalone|\/parse5\/|\/edit\/index\.ts|compile-protocol\.ts/.test(p)
  )).toEqual([]);
});
```

If web test package cannot directly resolve esbuild, add its existing workspace-pinned version as a devDependency (`pnpm --filter @meld/web add -DE esbuild@0.25.12`). Run `pnpm --filter @meld/web test screen-compiler.bundle`. Commit `test: enforce the source worker bundle boundary`.

### H3. Worker transport and frame picking

**Files:** `L/compile-protocol.ts`, `L/compile.worker.ts`, `L/screen-compiler.ts`, `L/live-messages.ts`, `L/live-controller.ts`, `R/runtime/bridge.ts` and matching tests. Preserve existing compile callers.

- [ ] Test one worker servicing overlapping compile/inspect/tweak requests, interleaved replies, disposal and malformed payloads. Add a bridge DOM test with a button inside a link, a click counter and a picked target; assert exactly one pick, no navigation/counter increment while picking, normal clicks after disabling. Verify independent frames cannot supply picks; simulate a stale current-frame event after a recompile.
- [ ] Extend the compiler client with `inspect(files:Files,src:string):Promise<Inspection>`, `tweak(files:Files,src:string,tweak:Tweak):Promise<EditResult>` and `links(files:Files):Promise<string[]>`. Discriminate requests and replies by op and numeric ID; only the worker handler imports edit and extractLinks. Preserve the lazy worker and reject all pending work on crash/disposal. Reject mismatched result shapes. Add an esbuild metafile test that bundles the board-facing client in browser mode and asserts no inputs under Babel standalone, parse5, edit/index or compile-protocol; use type imports to reference protocol types.
- [ ] Send host `{source:"orion-host",type:"pick-mode",enabled,epoch}` only to the currently attached frame. Bridge checks parent/source/type and integer epoch. Intercept click in capture phase before the navigation handler, suppress default and propagation only in pick mode, resolve closest tagged ancestor, bound label to 100 chars. Emit `{source:"orion-frame",type:"picked",src,label,epoch}`. Expand strict host schema; require current WindowProxy, matching epoch, enabled pick, known file and exact worker-verified span. Invalidate selection on source revision or frame/document change; clear intercept on disable/sleep. Rebuild runtime with `pnpm --filter @meld/screen-runtime build:runtime` if bridge is included in generated artifact; inspect diff before staging. Run `pnpm --filter @meld/screen-runtime test bridge && pnpm --filter @meld/web test live-messages screen-compiler compile-protocol live-controller`. Commit `feat: pick elements and route source edits through the worker`.

#### H3 implementation sheet: protocol isolation and selection bridge

Move createInlineCompiler and its tests into `L/inline-compiler.ts` and `L/inline-compiler.test.ts`; it is for explicitly injected tests only. For browser contexts with no Worker implement an unavailable compiler with a visible Code diagnostic, keeping source reading/export enabled. Preserve existing Playwright browser worker use and explicitly override compiler in jsdom integration tests. This removes the dynamic import from screen-compiler.ts that otherwise retains parser dependencies in its main-module graph. Worker absence cannot silently execute Babel on the UI thread.

```ts
type Calls = {
  compile:{args:{source:ScreenSource;tagElements:boolean}; result:CompileResult};
  inspect:{args:{files:Files;src:string}; result:Inspection};
  tweak:{args:{files:Files;src:string;tweak:Tweak}; result:EditResult};
  links:{args:{files:Files}; result:string[]};
};
export type SourceRequest = {[K in keyof Calls]:{id:number;op:K}&Calls[K]["args"]}[keyof Calls];
type Success<K extends keyof Calls> = {id:number;op:K;result:Calls[K]["result"]};
type SourceSuccess = { [K in keyof Calls]: Success<K> }[keyof Calls];
type SourceFailure = {id:number;op:keyof Calls;error:string};
export type SourceReply = SourceSuccess | SourceFailure;
type PendingCall = {op:keyof Calls;resolve:(result:unknown)=>void;reject:(e:Error)=>void};
function settle(reply:SourceReply,pending:Map<number,PendingCall>) {
  const waiter=pending.get(reply.id);
  if(!waiter)return;
  pending.delete(reply.id);
  if(waiter.op!==reply.op) return waiter.reject(new Error("Unexpected screen worker operation"));
  if("error" in reply) return waiter.reject(new Error(reply.error));
  waiter.resolve(reply.result);
}
// Handler only runs inside the worker or a server-side unit test.
export function perform(req:SourceRequest):SourceSuccess {
  switch(req.op) {
    case "compile":return {id:req.id,op:req.op,result:compileScreen(req.source,{tagElements:req.tagElements})};
    case "inspect":return {id:req.id,op:req.op,result:inspectElement(req.files,req.src)};
    case "tweak":return {id:req.id,op:req.op,result:applyTweak(req.files,req.src,req.tweak)};
    case "links":return {id:req.id,op:req.op,result:extractLinks(req.files)};
  }
}
```

Use strict Zod input schemas in the worker (ScreenSourceSchema, ScreenFilesSchema, positive bounded field/src/value and safe-integer ID, string enum for fields). On shape failure with valid ID send an explicit `{id,op,error:string}` and settle the client promise; unknown ID is ignored. Maintain op in every pending waiter, reject unexpected replies, terminate an errored worker and allow a fresh worker for future requests. On synchronous postMessage exception remove waiter and reject. For the bundle metafile test import only the production client, bundle browser mode and include dynamic imports in the check. A compiler incapable of running returns `{ok:false,errors:[{file:"",message:"This browser could not start the screen editor."}]}` for compile, rejects editing calls and leaves its UI in read-only mode.

Bridge wire implementation inside FRAME_BRIDGE_SOURCE (use existing interpolated constants in actual file). Install pick **inside** the existing capture click handler before the navigation logic. Add the pick-mode branch in the existing validated parent message handler; do not replace the snapshot branch. Only pass `src` (+ short label) to the host. No picked outerHTML, selectors or script execution.

```js
let picking=false, epoch=0;
function setMode(data) {
  if(data.type!=="pick-mode" || typeof data.enabled!=="boolean" ||
    !Number.isSafeInteger(data.epoch) || data.epoch<epoch) return;
  epoch=data.epoch; picking=data.enabled;
}
function interceptPick(event) {
  if(!picking) return false;
  event.preventDefault(); event.stopImmediatePropagation();
  const target=event.target;
  const node=(target && typeof target.closest==="function" ? target : target && target.parentElement)
    ?.closest("[data-orion-src]");
  if(node) {
    const src=node.getAttribute("data-orion-src");
    if(src && src.length<=155) post({type:"picked",epoch,src,
      label:(node.getAttribute("aria-label")||node.textContent||node.tagName).trim().slice(0,100)});
  }
  return true;
}
```

Add host discriminated-union member `z.object({source,type:z.literal("picked"),epoch:z.number().int().nonnegative(),src:z.string().min(1).max(155),label:z.string().max(100)}).strict()`. Ensure controller checks current WindowProxy and active pick epoch before callback. Do not read recursively nested frame DOM. For H3 tests register multiple listeners accurately in a real jsdom document or use existing bridge setup with one capture handler. Run the existing snapshot suite to confirm tag attributes are absent from the exported picture.

### H4. Convert existing screens without duplicating the board element

**Files:** `L/live-source.ts`, new `L/edit-target.ts`, `B/design-screen-board.ts`, `D/canvas-screen-source.ts`, `D/canvas-screen-source-fake.ts`, their tests and a separately reviewed scratch migration `supabase/migrations/20261120100100_canvas_screen_board_conversion.sql` created with `supabase migration new canvas_screen_board_conversion`. Use a room-authorized database-backed conversion lookup so a lost create response or two clients cannot create two screens for one board object.

```ts
type EditTarget =
  | {kind:"versioned"|"legacy"; screenId:string; versionId:string}
  | {kind:"board"; roomId:string; boardId:string};
type EditableLiveSource = LiveSource & {target:EditTarget|null};
```

- [ ] Extend live-source tests for three origins. Opening, picking, exporting or a no-op edit causes zero writes. Unsaved board-only screen outside an editable room stays readable. Missing design read is an error; never classify failure as board-only. Feed pasted screens their returned version ID or load it before editing.
- [ ] Existing legacy: retain board HTML including scripts as index.html, save edited text with kind html, entry index.html and original base on the *same* design ID. Existing versioned: retain server kind, entry, ID and base. Board-only: implement `convertBoardScreen({roomId,boardId,name,formFactor,source}):Promise<({status:"created";screenId:string;versionId:string;existing:boolean}|{status:"error"})>`. Capture original board screen key and room at opening. Derive device from frame dimensions against existing frameSizeForFormFactor presets (nearest aspect ratio for custom frames); use board label if available. Validate ID/source/form factor and room edit permission on server.
- [ ] Add an internal mapping keyed by `(room_id,board_screen_id)` referencing the created screen; private schema or public with RLS and all direct grants revoked. In a security-definer RPC with fixed empty search_path, authorize with can_edit_room first, take transaction advisory lock on the namespaced room/board key, reread mapping, then create with public.create_canvas_screen and insert the mapping in that transaction. A repeated request returns existing ID and current head. If saved files already match attempted edit, acknowledge; otherwise keep both owners' work by reporting conflict. Use pgTAP for permissions, first/repeated conversion, rollback, two rooms with same key. Exercise two scratch sessions and verify one mapping, screen and initial version. Run H1 scratch pg_prove with added conversion cases.
- [ ] After success, update only embeddables sharing the original board source link via newElementWith and api.updateScene, seed screen cache at boardScreenId(screenId), preserve frame ID, geometry, ordering, grouping and arrows. Retain original cache for the room lifetime (including until the board save containing the new link is acknowledged); pending saves, snapshots and active draft follow the alias. If scene or room changed, defer reconciliation to the original room; a retry uses the persisted mapping. Prevent backfill from adding a second frame while conversion is publishing. Verify `pnpm --filter @meld/web test live-source edit-target design-screen-board canvas-screen-source`. Commit `feat: convert legacy and board-only screens on first edit`.

#### H4 implementation sheet: durable, room-scoped conversion

Reserve `supabase/migrations/20261120100100_canvas_screen_board_conversion.sql`. Use a dedicated schema, eligible for no Data API grants; grant only execution of the RPC to authenticated. Use the same room authorization and file validation as the existing create RPC. A transaction-level advisory lock serializes by room and original board screen ID, including two simultaneous authenticated tabs. A unique primary key supplies the durable invariant. The create call is inside the same SQL transaction as its mapping. The response for an existing mapping returns its current head; the application reads and compares that version before acknowledging an ambiguous retry. The link extraction is passed from H3 and validated again in SQL.

```sql
create schema if not exists canvas_edit_private;
revoke all on schema canvas_edit_private from public, anon, authenticated, service_role;
create table canvas_edit_private.board_screen_conversions (
  room_id uuid not null references public.rooms(id) on delete cascade,
  board_screen_id text not null,
  screen_id uuid not null unique references public.design_screens(id) on delete cascade,
  primary key (room_id, board_screen_id)
);
alter table canvas_edit_private.board_screen_conversions enable row level security;
revoke all on canvas_edit_private.board_screen_conversions from public, anon, authenticated, service_role;

create function public.convert_canvas_board_screen(
  target_room_id uuid, board_screen_key text, screen_name text, new_files jsonb,
  new_entry text, new_form_factor text, new_links text[]
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  previous public.design_screens;
  created jsonb;
begin
  if auth.uid() is null or not public.can_edit_room(target_room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if board_screen_key is null or board_screen_key !~ '^[a-z][a-z0-9_-]{0,63}$' or new_entry is distinct from 'index.html'
    or new_files is null or not public.canvas_screen_files_valid(new_files,new_entry)
    or new_form_factor is null or new_form_factor not in ('mobile','tablet','desktop')
    or coalesce(cardinality(new_links),0) > 100 or coalesce(array_ndims(new_links),1) <> 1
    or exists (select 1 from unnest(new_links) x(key)
               where key is null or key !~ '^[a-z][a-z0-9_-]{0,63}$')
  then
    raise exception 'invalid_canvas_screen' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_room_id::text || ':' || board_screen_key,0));
  select s.* into previous
  from canvas_edit_private.board_screen_conversions m
  join public.design_screens s on s.id=m.screen_id and s.room_id=m.room_id
  where m.room_id=target_room_id and m.board_screen_id=board_screen_key
  for update of s;
  if found then
    if previous.deleted_at is not null then
      raise exception 'screen_deleted' using errcode = 'P0001';
    end if;
    return jsonb_build_object('existing',true,'screenId',previous.id,'versionId',previous.current_version_id);
  end if;
  created := public.create_canvas_screen(target_room_id, screen_name,'html',new_files,new_entry,new_form_factor);
  update public.design_screen_versions
    set links=coalesce(new_links,'{}'::text[])
    where id=(created->>'versionId')::uuid and screen_id=(created->>'screenId')::uuid;
  insert into canvas_edit_private.board_screen_conversions(room_id,board_screen_id,screen_id)
    values(target_room_id,board_screen_key,(created->>'screenId')::uuid);
  return created || jsonb_build_object('existing',false);
end;
$$;
revoke all on function public.convert_canvas_board_screen(uuid,text,text,jsonb,text,text,text[])
  from public, anon, authenticated, service_role;
grant execute on function public.convert_canvas_board_screen(uuid,text,text,jsonb,text,text,text[])
  to authenticated;
```

Paste these pgTAP assertions after `created` and before `saved` in the original fixture. Add the four tests to its plan count alongside the rest of H1/H4 coverage. They must fail with the original migration. The db test runs in BEGIN/ROLLBACK, so a two-session concurrency run needs committed scratch-only fixture data in a separate setup transaction.

```sql
select throws_ok($sql$
  select public.save_canvas_screen_version((result->>'screenId')::uuid,
    (result->>'versionId')::uuid,'{"App.tsx":"x"}',array[null]::text[]) from created
$sql$, 'P0001','invalid_canvas_screen','null is not a link item');

create temporary table conversion as select public.convert_canvas_board_screen(
  'e4000000-0000-4000-8000-000000000001','old-frame','Converted',
  '{"index.html":"<main>first</main>"}','index.html','mobile','{}') as result;
select is((select result->>'existing' from conversion),'false','first conversion creates');
select is((select public.convert_canvas_board_screen(
  'e4000000-0000-4000-8000-000000000001','old-frame','Converted',
  '{"index.html":"<main>second</main>"}','index.html','mobile','{}')->>'screenId'),
  (select result->>'screenId' from conversion),'conversion replay resolves the same screen');
select is((select count(*) from public.design_screen_versions
  where screen_id=(select (result->>'screenId')::uuid from conversion)),1::bigint,
  'conversion replay does not append a version');
```

For H1 fake parity add `updating:boolean` to FakeScreen (initialize false on fakeCreate), check it with the stale-base branch under fakeSave; make the fake test establish a busy fixture through its colocated fake store test helper. The SQL guard applies even to a matching head. Do not expose the fixture mutation as a production server action.

#### H4 restore compatibility at Plan 2 commits 6f345972 and 8cfdfbbb

`Screen.snapshot?:true` means scriptless rendered picture. If readScreenSource returns legacy and the board has a flagged picture, regenerate executable legacy source from current design data; also recover when a legacy record lacks a board picture. Expose a new optional dependency `loadLegacy?:(screenId:string,versionId:string)=>Promise<string|null>` on resolveLiveSource. Implement the board adapter with loadRoomScreen(roomId,id), ensure sourceKind is absent and preview is present, use buildFramePreviewDoc with existing previewTheme/previewChromeCss assembly. Read head again before installing rebuilt HTML, with exact version comparison to guard a concurrent restore. Keep the flagged picture if either lookup fails. Keep wake read-only: use regenerated HTML in memory after both checks, preserve the existing scriptless picture, and persist the converted HTML only after the first edit. For direct read of descriptor use its version as edit base. Historical head switch from writable source to legacy during conflict reload follows the same resolver. Preserve `live.wake(boardId,preloaded?,frameId?):Promise<number|undefined>`, public sleep invalidating pending wake requests and private sleepCurrent for a wake-driven switch, and `frameId:state.frameId` in the edited-document reducer. Two identical linked embeddables must still run only one iframe.

```ts
// Branch after confirming read.status === "ok" and read.screen.legacy.
const previous=deps.store.get(boardScreenId);
if (previous?.snapshot || !previous?.html) {
  const html=await deps.loadLegacy?.(designId,read.screen.versionId);
  if (!html) return null;
  const verified=await deps.readSource(designId);
  if(verified.status!=="ok" || !verified.screen.legacy || verified.screen.versionId!==read.screen.versionId) return null;
  return {source:{kind:"html",files:{"index.html":html},entry:"index.html"},snapshot:false,
    target:{kind:"legacy",screenId:designId,versionId:read.screen.versionId}};
}
```

Use a mock original value `<main>from restored markup</main><script>window.restored=1</script>` and picture `<main>old snapshot</main>`; assert restored HTML is returned, no write during wake, version mismatch yields null. Include an explicit read-only reopening test through duplicate frame copies and after legacy version restore.

#### H4/H5 persistence adapter and registry wiring

`persistDraft(targetRef,source,base)` owns conversion and version writes. Separate host aliases from database IDs. A source is owned by one room/board key even if two Excalidraw elements point to it. A board-only conversion updates every currently present link to the same original board key as one scene transaction, preserving each element ID, selection, geometry and all unrelated scene elements. The room+board ID key identifies shared source, whereas frameId identifies the single active view. When publishing new source IDs, migrate live-controller ownership atomically using `retargetSource(from,to)`, retaining mounted frame attempt, frameId, draft history and active CodeMirror instance. Do not wake a second iframe or reset timer history. In-flight source operations reference the original stable registry key, and a late snapshot for an obsolete alias cannot overwrite executable legacy HTML.

```ts
type TargetRef={current:EditTarget};
type PersistDeps={
  name:string;formFactor:"mobile"|"tablet"|"desktop";
  links:(files:Files)=>Promise<string[]>;
  versionWriter:ReturnType<typeof createVersionWriter>;
  convert:(input:{roomId:string;boardId:string;name:string;formFactor:"mobile"|"tablet"|"desktop";
    source:ScreenSource;links:string[]})=>Promise<
      {status:"created";screenId:string;versionId:string;existing:boolean}|{status:"error"}>;
  read:typeof readScreenSource;
  converted:(oldKey:string,screenId:string,versionId:string)=>void;
};
function sameFiles(left:Files,right:Files){
  return Object.keys(left).length===Object.keys(right).length &&
    Object.entries(left).every(([p,v])=>Object.hasOwn(right,p) && right[p]===v);
}
async function persistDraft(ref:TargetRef,source:ScreenSource,base:string|null,d:PersistDeps,retryUncertain?:true):
Promise<Awaited<ReturnType<typeof saveScreenVersion>>> {
  if(!ScreenSourceSchema.safeParse(source).success) return {status:"error"};
  const links=await d.links(source.files);
  const t=ref.current;
  if(t.kind==="board") {
    const created=await d.convert({roomId:t.roomId,boardId:t.boardId,name:d.name,
      formFactor:d.formFactor,source,links});
    if(created.status!=="created") return {status:"error"};
    ref.current={kind:"versioned",screenId:created.screenId,versionId:created.versionId};
    d.converted(t.boardId,created.screenId,created.versionId);
    if(created.existing){
      const head=await d.read(created.screenId);
      if(head.status!=="ok" || head.screen.legacy) return {status:"conflict",versionId:created.versionId};
      if(head.screen.source.kind!==source.kind || head.screen.source.entry!==source.entry ||
         !sameFiles(head.screen.source.files,source.files)) return {status:"conflict",versionId:head.screen.versionId};
      return {status:"saved",versionId:head.screen.versionId};
    }
    return {status:"saved",versionId:created.versionId};
  }
  const result=await d.versionWriter.write(t.screenId,source,base,links,retryUncertain);
  if(result.status==="saved") ref.current={kind:"versioned",screenId:t.screenId,versionId:result.versionId};
  return result;
}
```

A successful save reply changes version identity even if newer typing occurred. Only the captures passed to persistDraft become acknowledged by the H5 drain. Conflict when previously linked source has been deleted keeps draft export available. Failed local board relink after successful RPC keeps the stored mapping, so next visit can reconcile the original link before a further save. For board-only conversions whose unchanged aliases still appear on disk, perform room-scoped map lookup before backfill adds frames and reconcile original links first. The source loader may read the mapping; a wake must not create one. Use the following read-only RPC in the same new migration and expose it through `D/canvas-screen-source.ts`; pgTAP asserts a missing mapping returns null, existing mapping returns its screenId, and another room's user receives not_authorized.

```sql
create function public.read_canvas_board_conversion(target_room_id uuid,board_screen_key text)
returns uuid language plpgsql security definer stable set search_path='' as $$
declare matched uuid;
begin
  if auth.uid() is null or not public.can_edit_room(target_room_id) then
    raise exception 'not_authorized' using errcode='P0001';
  end if;
  select m.screen_id into matched from canvas_edit_private.board_screen_conversions m
    join public.design_screens s on s.id=m.screen_id and s.room_id=m.room_id
    where m.room_id=target_room_id and m.board_screen_id=board_screen_key and s.deleted_at is null;
  return matched;
end;
$$;
revoke all on function public.read_canvas_board_conversion(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_canvas_board_conversion(uuid,text) to authenticated;
```

Restrict this mapping reconciliation query to editor sessions; a viewer's existing read-only scene continues rendering static content. A new conflict from an uncertain normal save must not be silently treated as success merely because the version ID or content resembles local state. On explicit Retry after a network error read the head, reconcile identical full files/kind/entry only if a new version was actually recorded since the captured base. Do not issue a fresh version on an uncertain same-content replay. If the base differs with nonmatching content, return conflict. If the base is unchanged, retry the original guarded save.

**Registry API and acceptance**: instantiate a registry per immutable room key. `attach(boardId,draft):Draft` returns existing entry if already present. `alias(from,to):void` binds the new ID to the same object. `get(boardId):Draft|undefined`, `getSnapshot():readonly {boardId:string;status:DraftStatus}[]`, `subscribe(listener):()=>void` power open and closed panel state via useSyncExternalStore. Use cached snapshot objects until an actual status change. Flush only the departing room's dirty entries on route teardown; invalidate listeners before awaiting, dispose after settlements. React StrictMode simulated cleanup is handled by mounting/retaining/releasing a registry lease (cancel a scheduled teardown when the same registry is immediately retained again). On actual page close persistence is best effort.

```ts
export function createDraftRegistry(){
  const byId=new Map<string,{key:string;draft:Draft}>();
  const unsubscribe=new Map<Draft,()=>void>();
  const listeners=new Set<()=>void>();
  let view:readonly {boardId:string;status:DraftStatus}[]=[];
  let releases:ReturnType<typeof setTimeout>|undefined;
  function emit(){
    const entries=Array.from(new Set(byId.values()));
    view=entries.map(e=>({boardId:e.key,status:e.draft.getState().status}));
    listeners.forEach(fn=>fn());
  }
  return {
    get:(id:string)=>byId.get(id)?.draft,
    attach(id:string,draft:Draft){
      const old=byId.get(id);
      if(old) return old.draft;
      byId.set(id,{key:id,draft});unsubscribe.set(draft,draft.subscribe(emit));emit();return draft;
    },
    alias(from:string,to:string){
      const item=byId.get(from); if(!item)return;
      item.key=to;byId.set(to,item);emit();
    },
    subscribe(fn:()=>void){listeners.add(fn);return ()=>{listeners.delete(fn);};},
    getSnapshot:()=>view,
    retain(){clearTimeout(releases);},
    release(){
      clearTimeout(releases);
      releases=setTimeout(()=>{
        for(const [draft,off] of unsubscribe){
          off();void draft.flush().finally(()=>draft.dispose());
        }
        listeners.clear();unsubscribe.clear();byId.clear();
      },0);
    }
  };
}
```

### H5. Draft history, serialized saves and conflict recovery

**Files:** New `L/edit-draft.ts`, `L/draft-registry.ts` and matching tests; integrate persistence through H4 edit-target. Board owns registry for room lifetime, independent of active panel. Key by original board ID plus room, alias after conversion.

```ts
type DraftStatus = "clean"|"dirty"|"saving"|"conflict"|"error";
type DraftState = {source:ScreenSource;revision:number;base:string|null;status:DraftStatus;canUndo:boolean;canRedo:boolean};
type Draft = {getState():DraftState; subscribe(fn:()=>void):()=>void;
 replace(files:Files):void; undo():void; redo():void; flush():Promise<void>; retry():Promise<void>;
 reloadLatest():Promise<void>; dispose():void};
```

- [ ] With Vitest fake timers assert no save at 1999 ms, exactly one at 2000 ms, immediate sleep flush, clean sleep writes zero. Use deferred promise for save A, edit B, flush twice, settle A, then assert B saves once against A's returned base. Undo to acknowledged content is clean; redo after new edit unavailable. Failure/conflict retains files and history after switching A→B→A. Late latest-read never discards intervening typing. Test sleeping while first conversion is in flight and a response lost after durable commit.
- [ ] Store immutable file snapshots sharing unchanged strings; keep one board undo history for code + tweaks. Mutations increment revision and invalidate redo, no-ops do neither. Keep dirty state by content comparison against last acknowledged source. At flush capture source, revision, base and immutable target. Attach callers to one in-flight drain; after ack advance base and acknowledge captured content only, then drain newer dirty snapshot if flush is pending. Use H3 worker links(files) on the exact saved files. Allow syntactically incomplete Code drafts within schema limits to save; keep last good preview. Invalid size/path or failed RPC retains local draft with actionable error. Do not automatically retry errors in a tight loop. Compare latest files after ambiguous response, adopt matching head on explicit retry. On conflict suspend automatic saves. Explicit Reload latest rereads source, replaces history/base only if read succeeded and no later edits occurred; otherwise retain draft and choice.
- [ ] Use the same flush with original key for Escape, empty canvas, switching, closing panel if it sleeps, and room navigation under board control. Preserve registry entries with failed/conflicted saves for revisits, expose persistent status while asleep. Pin registry until in-flight work settles; unload gets best-effort only. Run `pnpm --filter @meld/web test edit-draft draft-registry edit-target` green then commit `feat: save undoable screen drafts with conflict recovery`.

#### H5 implementation sheet: edit, idle-save and sleep ordering

Use this concrete contract in H4–H8. `flush()` waits for the captured screen's latest queued work and resolves on conflict/error as well as success. Its final status is observable on the draft. It never rejects into a board event handler. A board transition starts the flush immediately, ends the live iframe using the existing bounded snapshot wait and does **not** hold screen B's wake on A's network. Hidden entries remain addressable by the registry until room teardown and any pending writes finish. Pressing Reload latest is the only operation allowed to discard a conflict draft. All state and dependencies in the sheet belong to one Draft instance, never to a global “current screen”.

```ts
import type { ScreenSource } from "@meld/screen-runtime/source";

type Files = Record<string, string>;
type Write = (source: ScreenSource, base: string | null, retryUncertain?:true) => Promise<
  | { status: "saved"; versionId: string }
  | { status: "conflict"; versionId: string | null }
  | { status: "error" }
>;
type Read = () => Promise<{source:ScreenSource; versionId:string} | null>;
type Status = DraftStatus;

export function createEditDraft(initial: ScreenSource, initialBase: string|null, write: Write, read: Read) {
  let source = initial;
  let acknowledged = initial.files;
  let base = initialBase;
  let revision = 0;
  let status: Status = "clean";
  let writeRequested = false;
  let failedCapture:ScreenSource|null=null;
  let explicitRetry=false;
  let active: Promise<void>|null = null;
  let timer: ReturnType<typeof setTimeout>|undefined;
  const past: Files[] = [];
  const future: Files[] = [];
  const listeners = new Set<() => void>();
  const equal = (a: Files, b: Files) => Object.keys(a).length === Object.keys(b).length
    && Object.entries(a).every(([k,v]) => Object.hasOwn(b,k) && b[k] === v);
  const snapshot = () => ({source, base, revision, status, canUndo:!!past.length, canRedo:!!future.length});
  let view = snapshot();
  function publish() {
    view = snapshot();
    for (const listener of listeners) listener();
  }
  function cancelTimer() { clearTimeout(timer); timer = undefined; }
  function changed(files:Files) {
    cancelTimer();
    source = {...source, files};
    revision++;
    if (status !== "conflict" && !failedCapture) {
      status = active ? "saving" : equal(files, acknowledged) ? "clean" : "dirty";
      timer = setTimeout(() => { void flush(); }, 2000);
    }
    publish();
  }
  async function drain() {
    while (writeRequested && status !== "conflict") {
      writeRequested = false;
      const recovering=explicitRetry && failedCapture!==null;
      const capture = recovering ? failedCapture! : source;
      explicitRetry=false;
      if (!recovering && equal(capture.files, acknowledged)) { status = "clean"; publish(); continue; }
      status = "saving";
      publish();
      let reply:Awaited<ReturnType<Write>>;
      try { reply = recovering ? await write(capture,base,true) : await write(capture,base); }
      catch { reply = {status:"error"}; }
      if (reply.status !== "saved") {
        failedCapture=reply.status==="error" ? capture : null;
        cancelTimer(); writeRequested = false; status = reply.status; publish(); return;
      }
      failedCapture=null;
      if(recovering && !equal(source.files,capture.files)) writeRequested=true;
      base = reply.versionId;
      acknowledged = capture.files;
      status = equal(source.files, acknowledged) ? "clean" : "dirty";
      publish();
    }
  }
  function flush(): Promise<void> {
    cancelTimer();
    if (status === "conflict" || (failedCapture && !explicitRetry)) return active??Promise.resolve();
    writeRequested = true;
    if (!active) {
      // Set active before starting drain, including synchronous store listeners.
      active = Promise.resolve().then(drain).finally(() => {
        active = null;
        // A new explicit flush can arrive between drain resolution and cleanup.
        if (writeRequested && status !== "conflict") return flush();
      });
    }
    return active;
  }
  return {
    getState: () => view,
    subscribe(fn:()=>void) {listeners.add(fn); return () => {listeners.delete(fn);};},
    replace(files:Files) {
      if (equal(source.files,files)) return;
      past.push(source.files); future.length = 0; changed(files);
    },
    undo() {
      const files = past.pop(); if (!files) return;
      future.push(source.files); changed(files);
    },
    redo() {
      const files = future.pop(); if (!files) return;
      past.push(source.files); changed(files);
    },
    flush,
    retry(){
      if(status!=="error" || !failedCapture) return active??Promise.resolve();
      explicitRetry=true;
      return flush();
    },
    async reloadLatest() {
      if (status !== "conflict") return;
      const token = revision;
      let latest:Awaited<ReturnType<Read>>;
      try {latest = await read();} catch {return;}
      if (!latest || token !== revision || status !== "conflict") return;
      source = latest.source; acknowledged = source.files; base = latest.versionId;
      revision++; past.length = 0; future.length = 0; status = "clean"; publish();
    },
    dispose() {cancelTimer(); listeners.clear();}
  };
}
```

At H4's persistence boundary `write` first validates ScreenSourceSchema and extracts links in the worker. Its closure retains the *original* target and updates it after a successful conversion. Before alternating source kinds, verify the persisted room/screen identity. For server results that may represent a lost acknowledgment, return conflict unless an authenticated read confirms matching full kind, entry and files. Do not treat a matching current version alone as successful when the server reports busy.

**H5 red/green examples:** place in `L/edit-draft.test.ts` alongside the additional matrix above.

```ts
import {afterEach, expect, it, vi} from "vitest";
import {createEditDraft} from "./edit-draft";
const page = (html:string) => ({kind:"html" as const,entry:"index.html",files:{"index.html":html}});
afterEach(() => {vi.useRealTimers();});
it("flushes the next captured edit against the acknowledged version", async () => {
  vi.useFakeTimers();
  let complete!: (value:{status:"saved"; versionId:string})=>void;
  const first = new Promise<{status:"saved";versionId:string}>(resolve => {complete=resolve;});
  const write = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce({status:"saved",versionId:"v3"});
  const draft = createEditDraft(page("old"),"v1",write,async () => null);
  draft.replace(page("A").files);
  await vi.advanceTimersByTimeAsync(1999);
  expect(write).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(write).toHaveBeenCalledWith(page("A"),"v1");
  draft.replace(page("B").files);
  const sleeping = draft.flush();
  expect(draft.flush()).toBe(sleeping);
  complete({status:"saved",versionId:"v2"});
  await sleeping;
  expect(write.mock.calls).toEqual([[page("A"),"v1"],[page("B"),"v2"]]);
  expect(draft.getState()).toMatchObject({base:"v3",status:"clean"});
});
it("preserves the conflict while a latest read races typing", async () => {
  let finish!: (value:{source:ReturnType<typeof page>;versionId:string})=>void;
  const read = () => new Promise<{source:ReturnType<typeof page>;versionId:string}>(r=>{finish=r;});
  const draft = createEditDraft(page("old"),"v1",async()=>({status:"conflict",versionId:"v2"}),read);
  draft.replace(page("mine").files); await draft.flush();
  const reading = draft.reloadLatest();
  draft.replace(page("more").files);
  finish({source:page("theirs"),versionId:"v2"}); await reading;
  expect(draft.getState()).toMatchObject({status:"conflict",source:page("more")});
  draft.dispose();
});
```

**Board/controller seam (H5/H6).** Extend LiveDeps with `onSleepStart?:(boardScreenId:string)=>void` while preserving Plan 2's existing `onSleep?:()=>void` for selection UI cleanup. At the beginning of sleepOnce, before requestSnapshot or any await, guard asleep, capture boardScreenId, cancel preview timer, increment previewEpoch, mark the active document departing, disable pick and call onSleepStart with the captured ID. In a finally block after the snapshot wait, invoke onSleepStart again for that same captured ID before dispatching sleep; the second flush includes edits made during the wait. These flush requests never await network persistence. Call the existing onSleep only after dispatch sleep. Wire handler as follows.

```ts
function onSleepStart(id:string) {
  const draft = drafts.get(id);
  if (draft) void draft.flush();
}
```

The registry returns the cached draft even when a wake follows a sleep whose save is still pending. For any origin, hook the live controller's loadSource adapter to prefer the cached unsaved source while keeping the original origin and snapshot permissions. Never send the same async compile through wake(): wake tears down or refuses a same-screen preview. Add a separate preview path. Treat `latestWake` as wake-request ownership and `previewEpoch` as the edit sequence. Set `previewEpoch++` synchronously on every revision, sleep, new wake, reload and dispose, before any worker call. Frame messages still require active frame WindowProxy identity. Replace the frame (different React key) only when a newer preview actually compiles. An edit request rejected in the worker sets file diagnostics and leaves the frame running. If a clean wake is compiling and first edit supersedes it, the initial compile must also check the captured previewEpoch before installing its document.

```ts
// Inside createLiveController. Existing controller owns dispatch, state, deps and readiness timer.
let previewEpoch = 0;
let previewTimer: ReturnType<typeof setTimeout>|undefined;
function cancelPreview() {
  clearTimeout(previewTimer);
  previewTimer = undefined;
  return ++previewEpoch;
}
function previewDraft(boardId:string, source:ScreenSource, revision:number, origin:"code"|"tweak"|"history") {
  const target=activeDocument;
  if(!target || target.boardId!==boardId) return;
  target.currentRevision=revision;
  setPickEnabled(false);
  if(target.departing) return;
  const epoch = cancelPreview();
  const owns = () => activeDocument===target && !target.departing && epoch===previewEpoch
    && target.currentRevision===revision && state.phase!=="asleep";
  const publish = (issues:CompileError[]) => deps.onDraftIssues?.(target.boardId,revision,issues);
  function fail(errors:CompileError[]){
    if(!owns())return;
    publish(errors);
    if(target.installedRevision===null && state.phase!=="asleep")
      dispatch({type:"draft-compile-failed",attempt:state.attempt,screenId:target.boardId,source,errors});
  }
  async function run() {
    if (!owns()) return;
    try {
      const [result,bundle] = await Promise.all([deps.compile(source),deps.runtimeBundle()]);
      if (!owns()) return;
      if (!result.ok) {fail(result.errors); return;}
      const document = assembleScreenDocument(result.screen,{csp:FRAME_CSP,runtimeBundle:bundle});
      target.installedRevision=revision;
      publish([]);
      dispatch({type:"edited-document",screenId:target.boardId,source,document});
    } catch (error) {
      fail([{file:"",message:error instanceof Error ? error.message : String(error)}]);
    }
  }
  if (origin === "code") previewTimer = setTimeout(() => {void run();},600);
  else void run();
}
```

Add `onDraftIssues?:(boardId:string,revision:number,issues:CompileError[])=>void` and gate diagnostics in the registry by exact board key and current draft revision. Add the following reducer branch and mirror Plan 2's loading transition in the controller timer setup. Refresh snapshot eligibility after conversion using the stable draft alias and source snapshot flag; never flip it merely because an edit happened.

```ts
case "draft-compile-failed":
  if(state.phase==="asleep" || state.attempt!==event.attempt || state.screenId!==event.screenId) return state;
  return {phase:"compile-failed",attempt:state.attempt,screenId:state.screenId,frameId:state.frameId,source:event.source,errors:event.errors};
case "edited-document":
  if (state.phase === "asleep" || state.screenId !== event.screenId) return state;
  return {phase:"loading",screenId:event.screenId,attempt:state.attempt+1,frameId:state.frameId,
    source:event.source,document:event.document,errors:[]};
```

### H6. Compile edited drafts while retaining the working iframe

**Files:** `L/live-controller.ts`, `L/live-state.ts`, `B/frame-host.tsx`, `R/compile.ts`, matching tests. Add `previewDraft(boardId:string,source:ScreenSource,revision:number,origin:"code"|"tweak"|"history"):void` on LiveController; keep wake/reload behavior.

- [ ] With fake timers type invalid TSX in running A, advance 599 ms and assert no compile; at 600 ms resolve failure and verify iframe node, document, attempt and runtime state remain identical. Resolve a superseded successful compile after a newer failure; it must have no effect. Test first wake failure can be corrected in Code, successful edit mounts fresh guarded frame, tweak compiles immediately, stale completion after sleep is dropped.
- [ ] Scheduled compile keys combine room/board ID, wake epoch and revision. Cancel timer when superseded, invalidate pending callbacks on switch/sleep/dispose. Submit `compile(source,{tagElements:true})`; on success assemble through existing runtimeBundle/assembleScreenDocument/FRAME_CSP, atomically install document with fresh attempt, reset ready watchdog and picks. On error publish diagnostics separately from the running phase; keep last good document mounted, or keep thumbnail for first failure. Snapshot only mounted successful document and only when current stored source allows it. Keep error IDs scoped to current revision.
- [ ] Extend CompileError with optional one-based line and zero-based column from Babel error.loc for source file, preserve original file/line offsets when compiling inline HTML scripts; errors without reliable positions appear in file list without invented squiggles. Existing diagnostic shapes remain accepted. Run `pnpm --filter @meld/screen-runtime test compile && pnpm --filter @meld/web test live-controller live-state frame-host`. Commit `feat: keep the last good live render during code edits`.

#### H6 regression tests at the existing normal controller entry points

The following use the real `setup`, `source`, `compiled` and fake timers in `L/live-controller.test.ts`.

```ts
it("keeps the identical working document on a 600 ms draft failure", async () => {
  const onDraftIssues = vi.fn();
  const compile = vi.fn().mockResolvedValueOnce(compiled)
    .mockResolvedValueOnce({ok:false,errors:[{file:"App.tsx",message:"Unexpected token"}]});
  const {live,attach,send} = setup({compile,onDraftIssues});
  await live.wake("a"); attach(); send({type:"ready"});
  const before = live.getState();
  live.previewDraft("a",{...source,files:{"App.tsx":"<"}} ,1,"code");
  await vi.advanceTimersByTimeAsync(599); expect(compile).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(onDraftIssues).toHaveBeenCalledWith("a",1,[{file:"App.tsx",message:"Unexpected token"}]);
  expect(live.getState()).toBe(before);
});
it("can wake B while the persistence flush for A is pending", async () => {
  let finish!:()=>void;
  const pending = new Promise<void>(resolve=>{finish=resolve;});
  const write = vi.fn(()=>pending);
  const {live} = setup({onSleepStart:(id)=>{if(id==="a") void write();}});
  await live.wake("a");
  await live.wake("b");
  expect(write).toHaveBeenCalledOnce();
  expect(live.getState()).toMatchObject({phase:"loading",screenId:"b"});
  finish(); await pending;
});
it("ignores an earlier preview reply after switching screens", async () => {
  let finish!:(result:CompileResult)=>void;
  const pending = new Promise<CompileResult>(resolve=>{finish=resolve;});
  const compile = vi.fn().mockResolvedValueOnce(compiled).mockReturnValueOnce(pending).mockResolvedValueOnce(compiled);
  const {live} = setup({compile});
  await live.wake("a"); live.previewDraft("a",source,1,"tweak");
  await live.wake("b"); const after = live.getState();
  finish(compiled); await vi.advanceTimersByTimeAsync(0);
  expect(live.getState()).toBe(after);
});
```

### H7. CodeMirror file editing and source export

**Files:** `apps/web/package.json`, `pnpm-lock.yaml`, new `L/code-editor.tsx`, `L/source-export.ts`, tests, `L/live-panel.tsx`. Lazy-load client editor on Code open.

- [ ] Run `pnpm --filter @meld/web add -E @codemirror/state@6 @codemirror/view@6 @codemirror/lang-javascript@6 @codemirror/lang-html@6 @codemirror/lang-css@6 @codemirror/lint@6 jszip@3.10.2`. Use roundtrip export tests decoding the zip, including subfolders and non-ASCII text. Assert active-file clipboard matches draft byte-for-byte, single download preserves original filename, multi download contains all and only exact source paths, no injected tags/scripts. Exercise clipboard rejection and revoke object URL after download dispatch.
- [ ] Use EditorState/EditorView and updateListener on a ref-backed Astryx layout component. Install javascript({jsx:true,typescript:true}) for TSX, correct flags for JS/JSX/TS, html() and css() by suffix. Destroy view on unmount. Only render file tabs when multiple files exist, default entry and retain per-file cursor/scroll; update draft exactly once for docChanged user transactions. Explicit external replacement annotation prevents feedback. Route Cmd/Ctrl-Z, Shift-Z and Ctrl-Y into Draft (suppress board/global history when editor focused). Map validated line/column with doc.line and bounded offsets into setDiagnostics; errors without location remain accessible in panel. Code remains editable after failed compilation.
- [ ] Implement `copyFile(source:ScreenSource,path:string):Promise<void>` via navigator.clipboard.writeText(source.files[path]); `downloadSource(source:ScreenSource,name:string):Promise<void>` creates text Blob for one path, JSZip via lazy import for multi, uses safe basename derived from title for zip, anchors with download, then removes anchor and releases URL. Offer Copy for active tab and Download for whole screen. Add tests for edit/file switch/undo, button names, save conflict and diagnostics. Run `pnpm --filter @meld/web test code-editor source-export live-panel`, commit `feat: edit and export screen files from the Code tab`.

#### H7 implementation sheet: CodeMirror and original-file export

**Bundle surface:** `L/source-export.ts` owns exports below. The editor imports CodeMirror state, view, lint and language packages. Expose a reusable `downloadBlob(source,name):Promise<{blob:Blob;name:string}>` so byte content can be tested without clicking an anchor.

```ts
import type {ScreenSource} from "@meld/screen-runtime/source";
export async function copyFile(source:ScreenSource,path:string):Promise<void> {
  if(!Object.hasOwn(source.files,path)) throw new Error("Choose a source file to copy.");
  await navigator.clipboard.writeText(source.files[path]);
}
export async function downloadBlob(source:ScreenSource,name:string) {
  const entries=Object.entries(source.files);
  if(entries.length===1){
    const [path,code]=entries[0];
    return {name:path.split("/").at(-1)!,blob:new Blob([code],{type:"text/plain;charset=utf-8"})};
  }
  const {default:JSZip}=await import("jszip");
  const zip=new JSZip();
  for(const [path,code] of entries) zip.file(path,code,{createFolders:false});
  const base=name.trim().replace(/[^a-z0-9_-]+/gi,"-").replace(/^-+|-+$/g,"").slice(0,80)||"screen";
  return {name:base+".zip",blob:await zip.generateAsync({type:"blob"})};
}
export async function downloadSource(source:ScreenSource,name:string) {
  const out=await downloadBlob(source,name), url=URL.createObjectURL(out.blob);
  const anchor=document.createElement("a"); anchor.download=out.name; anchor.href=url;
  try {document.body.append(anchor); anchor.click();}
  finally {anchor.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
```

```ts
it("preserves authored multi-file paths and bytes",async()=>{
  const source={kind:"react" as const,entry:"App.tsx",files:{"App.tsx":"export default ()=> <p>Hi 🚲</p>","ui/main.css":"p { color:red }\n"}};
  const {blob,name}=await downloadBlob(source,"My page!");
  expect(name).toBe("My-page.zip");
  const zip=await JSZip.loadAsync(await blob.arrayBuffer());
  expect(Object.keys(zip.files).sort()).toEqual(Object.keys(source.files).sort());
  for(const [path,code] of Object.entries(source.files)) expect(await zip.file(path)!.async("string")).toBe(code);
});
```

**CodeMirror mount:** `createFileEditor(parent:HTMLElement,path:string,initial:string,handlers:EditorHandlers):EditorView`. Use callbacks or refs updated on theme, permissions and selected draft changes. Host DOM is owned entirely by CodeMirror inside an Astryx ref-backed layout leaf. File switch snapshots selection and scroll per path before destroying/reconfiguring the editor. Route semantic changes to draft.replace with all other current files preserved. Call setDiagnostics from @codemirror/lint using the returned TransactionSpec. CodeMirror DOM focus and cursor must survive lint diagnostics, server save acks and frame reloads.

```ts
import {Annotation,EditorState,Prec} from "@codemirror/state";
import {EditorView,keymap} from "@codemirror/view";
import {javascript} from "@codemirror/lang-javascript";
import {html} from "@codemirror/lang-html";
import {css} from "@codemirror/lang-css";
import {setDiagnostics} from "@codemirror/lint";
const external=Annotation.define<boolean>();
type EditorHandlers={editable:boolean; change:(text:string)=>void; undo:()=>void; redo:()=>void};
function language(path:string) {
  if(/\.html?$/i.test(path)) return html();
  if(/\.css$/i.test(path)) return css();
  if(/\.[jt]sx?$/i.test(path)) return javascript({jsx:/x$/i.test(path),typescript:/\.tsx?$/i.test(path)});
  return [];
}
export function createFileEditor(parent:HTMLElement,path:string,initial:string,h:EditorHandlers) {
  const historyKey=(act:()=>void)=>()=>{if(h.editable)act();return true;};
  return new EditorView({parent,state:EditorState.create({doc:initial,extensions:[
    language(path),EditorState.readOnly.of(!h.editable),EditorView.editable.of(h.editable),
    EditorView.contentAttributes.of({"aria-label":"Source for "+path}),
    Prec.highest(keymap.of([{key:"Mod-z",run:historyKey(h.undo)},
      {key:"Mod-Shift-z",run:historyKey(h.redo)},{key:"Ctrl-y",run:historyKey(h.redo)}])),
    EditorView.updateListener.of(u=>{
      if(u.docChanged && !u.transactions.some(tr=>tr.annotation(external)))
        h.change(u.state.doc.toString());
    })
  ]})});
}
export function syncSource(view:EditorView,text:string) {
  if(view.state.doc.toString()===text) return;
  view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text},annotations:external.of(true)});
}
export function syncIssues(view:EditorView,path:string,issues:CompileError[]) {
  const doc=view.state.doc;
  const list=issues.flatMap(e=>{
    if(e.file!==path || e.line===undefined || e.column===undefined || e.line<1 || e.line>doc.lines) return [];
    const line=doc.line(e.line);
    const from=Math.min(line.to,line.from+Math.max(0,e.column));
    return [{from,to:Math.min(line.to,from+1),severity:"error" as const,message:e.message}];
  });
  view.dispatch(setDiagnostics(view.state,list));
}
```

Use a stable CodeMirror diagnostic column for UTF-16 offsets. Do not map synthetic inline script syntax lines into original HTML without the original script content start line and first-line column; preserve file-level issue text when positions cannot be reconstructed. Host field copy and export errors are reported with a Banner and retry button. Native WKWebView download/clipboard compatibility must be verified before claiming Mac coverage.

### H8. Tweak controls and board integration

**Files:** New `L/tweak-panel.tsx`, `L/hand-edit-panel.tsx`, colocated tests, `L/live-panel.tsx`, `B/excalidraw-board.tsx`. Reuse live panel tabs, source resolver, controller, screen store and selection pill. This task runs after Plan 2 board integration.

- [ ] Start with a rendered panel test: Tweak → Pick → literal button → change colour → assert worker tweak request, draft files and immediate preview; dynamic label shows disabled Text and accessible Add to chat. Simulate changing files before worker reply; stale tweak cannot overwrite typing. Confirm keyboard-only field editing, undo/redo and conflict banner.
- [ ] Reuse LayoutPanel width 280, TabList/Tab, VStack/HStack, TextInput, Button, Banner. Run Astryx discovery for each new component before UI edits. Use labeled inputs for text, foreground/background colour, font size/weight, padding, gap, radius, width and height; show units and validate before sending. Use displayed computed style from frame only as optional presentation; worker inspection determines actual ownership and writable values. Pick calls controller, worker inspects, controls send tweak with captured revision/src. On success draft.replace(result.files), refresh preview immediately. Revalidate exact span after document replacement; if changed clear old pick and allow picking again. Undo/redo act on draft in both tabs. Code pill opens Code; Open live defaults to Tweak. Preserve Plan 2 error/Show code paths and busy/reload overlays.
- [ ] Specify the Plan 4 handoff as an injected `onAddElement?(chip:{kind:"element";screenId:string;versionId:string;src:string;label:string}):void`. Require a persisted matching revision before handing off: flush, compare current source/revision to picked source; if conflict show Reload latest and keep selection. Unconverted or unavailable sender must explain availability beside disabled Add to chat, with no false success; preserve picked element and original data. Plan 4 supplies delivery to composer. Verify button emits exact captured chip with an injected sender in component tests.
- [ ] Wire all board sleep paths to H5 registry, swap preview using H6 and source identity using H4. Both signed-in and preview/fake paths use the same controls subject to an editable target. Run `pnpm --filter @meld/web test tweak-panel hand-edit-panel live-panel && pnpm check:astryx`. Commit `feat: tweak picked elements from the canvas panel`.

#### H8 execution tasks

### H8a. Accessible literal inspector and immutable history controls

**Files:** `L/tweak-panel.tsx`, `L/tweak-panel.test.tsx`. This is a pure view. **Produces:** TweakPanel with contract below. Initial fields are populated from H2 worker inspection; use a local input draft to allow intermediate keystrokes and commit validated values on Enter or blur, suppress duplicate commits by comparing last submitted value and current props. A successful commit triggers immediate worker compile.

```ts
type Props = {
  picking:boolean; fields:Inspection; selectedLabel:string|null;
  canUndo:boolean; canRedo:boolean;
  onTogglePick:()=>void; onUndo:()=>void; onRedo:()=>void;
  onTweak:(t:Tweak)=>void; onAdd:()=>void; canAdd:boolean;
};
const labels:Record<Field,string>={text:"Text",color:"Text colour",backgroundColor:"Background colour",
  fontSize:"Font size (px)",fontWeight:"Font weight",padding:"Padding (px)",gap:"Gap (px)",
  borderRadius:"Corner radius (px)",width:"Width (px)",height:"Height (px)"};
```

- [ ] Write the pure view red test with an inspection result built via `Object.fromEntries(Object.keys(labels).map(k=>[k,{editable:k!=="text",value:null}])) as NonNullable<Inspection>`. Render and find controls by accessible label. Verify disabled Text, enabled Padding, “Add to chat”, Undo, Redo, and changed field submits exactly once.

```tsx
const onTweak=vi.fn(), onAdd=vi.fn();
render(<TweakPanel fields={fields} picking={false} selectedLabel="Action" canUndo canRedo={false}
  onTogglePick={vi.fn()} onUndo={vi.fn()} onRedo={vi.fn()} onTweak={onTweak} onAdd={onAdd} canAdd />);
expect(screen.getByRole("textbox",{name:"Text"})).toBeDisabled();
await userEvent.type(screen.getByRole("textbox",{name:"Padding (px)"}),"16{Enter}");
expect(onTweak).toHaveBeenCalledExactlyOnceWith({field:"padding",value:"16"});
await userEvent.click(screen.getByRole("button",{name:"Add to chat"}));
expect(onAdd).toHaveBeenCalledOnce();
```

- [ ] Compose the inspector using existing Astryx TextInput API (`value`, `onChange(value)`, `isDisabled`) and Buttons. Pick remains exposed while the other fields require selection. Buttons disable when their action is unavailable. Place only nonliteral reasons near affected fields; show one fallback action. Test all fields' labels, repeated blur, invalid numerical input and label escaping. Run `pnpm --filter @meld/web test tweak-panel`. Commit `feat: show literal editing controls in Tweak`.

### H8b. Selection session, optimistic input and future chat handoff

**Files:** `L/element-session.ts`, `L/element-session.test.ts`. **Consumes:** H3 worker and H5 Draft. **Produces:** revision-scoped selection and callback adapter. All asynchronous operations capture immutable identity before issuing worker calls.

```ts
type Selected={src:string;label:string;boardId:string;revision:number;epoch:number};
type ElementChip={kind:"element";screenId:string;versionId:string;src:string;label:string};
async function commitTweak(draft:Draft, selected:Selected, tweak:Tweak, compiler:ScreenCompiler,
  current:()=>Selected|null, preview:(source:ScreenSource,revision:number)=>void) {
  const before=draft.getState();
  if(selected.revision!==before.revision || current()!==selected) return;
  const result=await compiler.tweak(before.source.files,selected.src,tweak);
  if(current()!==selected || draft.getState().revision!==before.revision || !result.ok) return;
  const source={...before.source,files:result.files};
  if(!ScreenSourceSchema.safeParse(source).success) return;
  draft.replace(result.files);
  const after=draft.getState();
  if(after.revision!==before.revision) preview(after.source,after.revision);
}
async function addPickedElement(draft:Draft, selected:Selected,current:()=>Selected|null,
  identity:()=>{screenId:string}|null, send?:(chip:ElementChip)=>void) {
  if(!send || current()!==selected || draft.getState().revision!==selected.revision) return false;
  await draft.flush();
  const after=draft.getState(), target=identity();
  if(after.status!=="clean" || after.revision!==selected.revision || current()!==selected || !target || !after.base) return false;
  send({kind:"element",screenId:target.screenId,versionId:after.base,src:selected.src,label:selected.label});
  return true;
}
```

- [ ] In `element-session.test.ts`, hold a tweak worker promise, type newer code, resolve successful worker reply, verify newer code remains and preview was never called. Repeat with old selected object after switching frame (same logical source). For chat injection use the real createEditDraft fixture with clean base v1 and verify returned chip; with pending conflict status, verify sender never called.
- [ ] Run `pnpm --filter @meld/web test element-session` before and after implementation. Commit `feat: bind picked changes to the current screen revision`.

### H8c. Connect the existing board controls to the registry

**Files:** `L/hand-edit-panel.tsx`, `B/excalidraw-board.tsx`, `L/live-panel.tsx`, matching tests. Preserve Plan 2's access/view guard for all mutation entry points. Use a room-scoped registry created with useMemo and useSyncExternalStore; initial mount and StrictMode cleanup never issue a write. Split read-only display from edit permission. Code/Copy/Download remain accessible when source is available, while editor uses EditorState.readOnly and EditorView.editable for view access. A server-side editor check still enforces write authorization.

```tsx
const LIVE_PANEL_TABS:readonly {value:LivePanelTab;label:string}[]=[
  {value:"tweak",label:"Tweak"},{value:"code",label:"Code"}
];
async function openPanel(boardId:string,frameId:string,tab:LivePanelTab) {
  const attempt=await live.wake(boardId,undefined,frameId);
  const current=live.getState();
  if(attempt===undefined || current.phase==="asleep" || current.attempt!==attempt ||
     current.screenId!==boardId || current.frameId!==frameId) return;
  setPanelTab(current.phase==="compile-failed"?"code":tab);setPanelOpen(true);
}
```

- [ ] Before attaching controls, test keyboard-only tabs, absent editable target, running screen state, last-good-with-errors, conflict status during open/closed panel and header accessible names. Preserve existing read-only LiveCodeView for unavailable edit target and initial load errors. Show Reload latest only on conflict, Retry on ordinary save failure; Retry calls draft.retry(). Keep sleep notifications scoped to the original boardId and original frameId, never read them from a later liveState closure.
- [ ] Implement panel children as draft editor or literal inspector using existing LayoutPanel end slot. Do not key the active code editor or panel on liveState.attempt or draft revision; cursor, focus and typing survive previews. Update double-click and Open live handlers to open Tweak, Code pill and Show code to open Code. Respect existing same-screen/different-frame semantics. Reuse createScreenCompiler() facade (worker in browser, unavailable-worker diagnostic when missing, inline test adapter explicitly injected); verify no eager import of the source editor even in fallback. Run `pnpm --filter @meld/web test hand-edit-panel live-panel live-controller && pnpm check:astryx`; commit `feat: integrate source editing into the live canvas frame`.

### H9. End-to-end acceptance and release checks

**Files:** Extend `e2e/canvas-excalidraw-live.spec.ts`. Test the completed Plan 2 entry points in a real browser.

- [ ] Paste an interactive React screen, open Tweak, pick a literal button, change colour, verify Code source and live style, undo/redo, copy untagged source. Enter invalid code, confirm diagnostics with still-interactive old button, fix, sleep before 2 seconds, reopen and verify exact edit plus one incremented version. Add HTML dynamic fallback, legacy/board-only save without a duplicate frame, multi-file tab/export, a two-editor conflict and Reload latest. Use Playwright expect.poll for persisted states and iframe locator actions; assert literal download contents via Node read and JSZip decode. Verify non-live frames stay scriptless.
- [ ] Run `pnpm typecheck && pnpm lint && pnpm check:astryx && pnpm test:colocation && pnpm test:workspace && pnpm test && pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts`. Preserve scratch SQL transcripts and independently inspect production board JS module graph for Babel/parse5 leakage. Run the Mac preview script and exercise pick, Code keyboard shortcuts, sleep/save, download and board panning in its actual WebKit surface. Record any missing Mac clipboard/download support separately with the observed behavior before calling the feature verified.
- [ ] Commit `test: cover hand editing through the canvas board`. Open stacked review against completed Plan 2 branch; include branch head, verified commands, screenshots, separate SQL review status and remaining chat integration seam. Shared migration application requires its own review decision.

#### H9 browser red/green specimen

Append to e2e/canvas-excalidraw-live.spec.ts alongside Plan 2 P4’s openRoomBoard and pasteCode helpers. A standalone /dev board without room does not supply an editable source target. Add this case, run it once red before integrating H8c and green against the finished panel. It exercises capture-mode suppression, actual colour rendering and transfer of authored code through browser clipboard.

```ts
test("a picked colour rewrites authored source and survives an immediate sleep",async({page,context,baseURL})=>{
  await context.grantPermissions(["clipboard-read","clipboard-write"],{origin:new URL(baseURL!).origin});
  await openRoomBoard(page,baseURL!);
  await pasteCode(page,'export default function App(){return <button className="bg-red-500">Start</button>}',"Actions","Phone");
  const live=page.locator("iframe[data-orion-live]");
  await expect(live).toBeVisible();
  const id=(await live.getAttribute("data-orion-live"))!;
  const panel=page.getByTestId("live-panel");
  await panel.getByRole("button",{name:"Tweak",exact:true}).click();
  await panel.getByRole("button",{name:"Pick",exact:true}).click();
  await page.frameLocator("iframe[data-orion-live]").getByRole("button",{name:"Start"}).click();
  const color=panel.getByRole("textbox",{name:"Background colour"});
  await color.fill("#123456");await color.press("Enter");
  const button=page.frameLocator("iframe[data-orion-live]").getByRole("button",{name:"Start"});
  await expect(button).toHaveCSS("background-color","rgb(18, 52, 86)");
  await panel.getByRole("button",{name:"Code",exact:true}).click();
  await panel.getByRole("button",{name:"Copy",exact:true}).click();
  const copied=await page.evaluate(()=>navigator.clipboard.readText());
  expect(copied).toContain("bg-[#123456]");expect(copied).not.toContain("data-orion-src");
  await page.keyboard.press("Escape");await expect(live).toHaveCount(0);
  await doubleClickScreen(page,id);
  await expect(page.frameLocator("iframe[data-orion-live]").getByRole("button",{name:"Start"}))
    .toHaveCSS("background-color","rgb(18, 52, 86)");
});
```

Use a second pass with page reload after server acknowledgement to distinguish a cached draft from durable persistence. Exercise quick re-open while save is pending separately using H6 controller tests. Maintain the existing blocked Code continuation regression: delayed wake of A, public sleep, then A reopened on same element must leave the newly chosen tab untouched; only the attempt that authorized a tab change may perform it.

## Integration review notes

Plan 2 board integration distinguishes persisted scriptless snapshots from executable source HTML using `snapshot?: true` on board Screen records. In H4, only unflagged original board HTML is eligible for legacy/board conversion. Missing executable source plus a flagged picture leaves Code unavailable, preserves the sleeping picture and triggers no conversion or RPC. In H6 preserve that flag when publishing snapshots. Extend H4 source resolver and H9 preview regression tests to assert a flagged snapshot never executes as source.

## Final interface and execution checks

Use the following additions alongside the existing Plan 2 controller API. `subscribe` and `getState` keep their normal meaning. Member names below are the same names implemented/tested by H3–H8. In L/live-source.ts add optional target to the existing LiveSource type for compatibility with Plan 2 preloaded paste callers, then require a target or call the editable resolver before exposing mutation controls. The identity used in messages is the **current persisted source screen**, while the registry alias preserves the original board key for saves.

```ts
export type ScreenCompiler = {
  compile(source:ScreenSource,options:{tagElements:boolean}):Promise<CompileResult>;
  inspect(files:Files,src:string):Promise<Inspection>;
  tweak(files:Files,src:string,tweak:Tweak):Promise<EditResult>;
  links(files:Files):Promise<string[]>;
  dispose():void;
};
// additions to LiveController
type EditControllerMembers={
  setPickEnabled(enabled:boolean):void;
  previewDraft(boardId:string,source:ScreenSource,revision:number,origin:"code"|"tweak"|"history"):void;
  retargetSource(from:string,to:string):void;
};
type EditControllerDeps={
  onPicked?:(boardId:string,src:string,label:string,epoch:number,revision:number)=>void;
  onDraftIssues?:(boardId:string,revision:number,issues:CompileError[])=>void;
  onSleepStart?:(boardId:string)=>void;
};
```

`setPickEnabled` increments a controller-local numeric epoch, posts pick-mode to the active frame, invalidates existing selection on removal, and never arms an asleep/stopped frame. Attach/detach paths reset pick state. `retargetSource` is a pure reducer event: if awake and current.screenId===from replace screenId only; preserve phase, frameId and attempt. Set snapshot eligibility on successful legacy→versioned mutation of the current target. Perform draft registry alias, retarget and Excalidraw scene link changes as a single synchronous publication; preserve active draft identity and previewEpoch across alias-only changes so an in-flight newer edit still installs on the newly named screen. Render duplicate-frame coverage before and after relink. Add a H6 red test for retarget while both current and duplicate frame are on screen.

```ts
case "retarget-source":
  return state.phase==="asleep" || state.screenId!==event.from ? state : {...state,screenId:event.to};
```

The final entry points of H2's worker-only API use a single resolver; partial excerpts in H2b/H2c are composed through these functions. Both format adapters return `descriptor(bindings)` and use `null` to decline a missing or synthetic element. All preflight decisions that disable a field must match the checks in its patch function.

```ts
function locate(files:Files,tag:Range):EditableNode|null {
  if (!Object.hasOwn(files,tag.file) || tag.start>=tag.end || tag.end>files[tag.file].length) return null;
  try {
    if (/\.html?$/i.test(tag.file)) return locateHtml(files[tag.file],tag);
    if (/\.[jt]sx?$/i.test(tag.file)) return locateJsx(files[tag.file],tag);
    return null;
  } catch {return null;}
}
export function inspectElement(files:Files,src:string):Inspection {
  const tag=parseTag(src);
  return tag ? locate(files,tag)?.inspect()??null : null;
}
```

**Self-review**

- §3 literal JSX/HTML text, Tailwind and inline styles, ambiguous expressions and stale UTF-16 ranges: H2a–d, H3, H8a/b.
- §5 wake, viewport/focus, one live iframe, 600 ms and last good render, 2 s and immediate sleep write request, undo/redo and conflict recovery: H3, H4, H5, H6, H8c, H9. Real Code/Download/clipboard and multi-file archive: H7/H9. Busy/stuck distinction and unchanged CSP/compile safety: H6/H9. Sleep can resume the next frame before the previous screen's network save acknowledges; H5 isolates capture/base/registry; H6 includes that race.
- Plan 1/2 carryovers: RPC validates items and busy state under the lock (H1). Board-only conversion has cross-client retry idempotency; legacy conversion preserves its design ID (H4). Restored legacy screen with `snapshot:true` regenerates source without ever executing its picture. Existing optional frame identity and attempt gating are retained (8cfdfbbb).
- Cross-task conventions: IDs are logical board key vs physical Excalidraw frame ID; positions are UTF-16 and revision-scoped; file copy uses the selected tab; download exports the complete authored file map; caller never persists worker-injected tags. Worker-only dependencies have an executable graph test.
- The schema review governs applying the two migrations to shared infrastructure. Plan 4 installs the chat delivery callback. A read-only “Add to chat” availability message remains until a sender exists. These are delivery dependencies, not design choices awaiting input. The SQL scripts, browser/Mac behavior, and package graph must be tested during implementation; the planning draft does not claim those results.

## Preflight closure implementation sheets

### H3/H6: installed revision, stable document ownership and sleep

**Files:** `L/live-controller.ts`, `L/live-controller.test.ts`, `L/live-state.ts`, `L/live-state.test.ts`. Add this controller-local record; it is independent of the mounted iframe attempt. A wake creates it before initial compilation, using the cached draft's revision (zero for untouched source). A successful initial compile sets installedRevision only if its captured previewEpoch and record still own the wake. Every authored mutation calls previewDraft synchronously, including undo/redo. A pick is usable only while the running document represents exactly the current draft.

```ts
type ActiveDocument = {
  boardId:string;
  currentRevision:number;
  installedRevision:number|null;
  departing:boolean;
};
let activeDocument:ActiveDocument|null=null;
function canPick(){
  const doc=activeDocument;
  return !!doc && !doc.departing && state.phase==="running"
    && doc.installedRevision!==null && doc.installedRevision===doc.currentRevision;
}
function retargetSource(from:string,to:string){
  if(activeDocument?.boardId!==from)return;
  activeDocument.boardId=to;
  dispatch({type:"retarget-source",from,to});
}
```

Do not increment previewEpoch, cancel compile work, replace ActiveDocument, or remount a frame on alias-only changes. H5/H6 preview closures capture the record by reference and dispatch using `target.boardId` when they settle. Source revision, sleep and actual screen changes invalidate preview ownership. Update setPickEnabled so `enabled && !canPick()` becomes disabled, increment the pick epoch on every mode change, and reject a received pick unless canPick() still holds. Pass installedRevision to onPicked; H8 must compare it to its draft before inspection. In the existing sleepOnce implementation keep its Plan 2 attempt guard and snapshot timeout, but set `departing=true` synchronously before awaiting. previewDraft may record a newer currentRevision during departure but never compile, install a frame, change attempt, or arm picking. The final captured-key flush includes that newer edit. Clear the departing record only if it is still the same object, so a newer wake cannot be cleared by an older finalizer.

- [ ] Append these tests to the existing live-controller fixture. Add `onPicked` to LiveDeps and keep setup's real message envelope.

```ts
it("rejects equal-length stale picks before and after failed compilation",async()=>{
  const onPicked=vi.fn();
  const compile=vi.fn().mockResolvedValueOnce(compiled)
    .mockResolvedValueOnce({ok:false,errors:[{file:"App.tsx",message:"broken"}]});
  const {live,frame,attach,send}=setup({compile,onPicked});
  await live.wake("a");attach();send({type:"ready"});
  live.setPickEnabled(true);
  const mode=frame.postMessage.mock.calls.at(-1)![0];
  const changed={...source,files:{"App.tsx":source.files["App.tsx"].replace("main","fail")}};
  expect(changed.files["App.tsx"].length).toBe(source.files["App.tsx"].length);
  live.previewDraft("a",changed,1,"code");
  send({type:"picked",src:"App.tsx:21:28",label:"old",epoch:mode.epoch});
  await vi.advanceTimersByTimeAsync(600);
  live.setPickEnabled(true);
  const latest=frame.postMessage.mock.calls.at(-1)![0];
  send({type:"picked",src:"App.tsx:21:28",label:"old",epoch:latest.epoch});
  expect(onPicked).not.toHaveBeenCalled();
  expect(live.getState().phase).toBe("running");
});
it("installs B when conversion aliases A during B compilation",async()=>{
  let finish!:(result:CompileResult)=>void;
  const compile=vi.fn().mockResolvedValueOnce(compiled)
    .mockImplementationOnce(()=>new Promise<CompileResult>(r=>{finish=r;}));
  const {live,attach,send}=setup({compile});
  await live.wake("old",undefined,"physical-frame");attach();send({type:"ready"});
  live.previewDraft("old",source,1,"tweak");
  const before=live.getState();
  live.retargetSource("old","ds-new");
  expect(live.getState()).toMatchObject({attempt:before.attempt,frameId:"physical-frame"});
  if(!compiled.ok)throw new Error("fixture");
  const newer:CompileResult={ok:true,screen:{...compiled.screen,html:"<button>B</button>"}};
  finish(newer);await vi.advanceTimersByTimeAsync(0);
  const after=live.getState();
  expect(after).toMatchObject({phase:"loading",screenId:"ds-new",frameId:"physical-frame"});
  if(after.phase!=="loading")throw new Error(after.phase);
  expect(after.document).toContain("<button>B</button>");
});
it("finishes sleep and flushes edits made during its snapshot wait",async()=>{
  const onSleepStart=vi.fn();
  const {live,attach,send,deps}=setup({onSleepStart});
  await live.wake("a");attach();send({type:"ready"});
  const attempt=live.getState().attempt;
  const sleeping=live.sleep();
  live.previewDraft("a",source,1,"history");
  live.setPickEnabled(true);
  await vi.advanceTimersByTimeAsync(SLEEP_SNAPSHOT_WAIT_MS);
  await sleeping;
  expect(live.getState()).toMatchObject({phase:"asleep",attempt});
  expect(deps.compile).toHaveBeenCalledTimes(1);
  expect(onSleepStart.mock.calls).toEqual([["a"],["a"]]);
});
it("leaves initial compiling after a superseding edit fails",async()=>{
  let finish!:(result:CompileResult)=>void;
  const compile=vi.fn().mockImplementationOnce(()=>new Promise<CompileResult>(r=>{finish=r;}))
    .mockResolvedValueOnce({ok:false,errors:[{file:"App.tsx",message:"broken"}]});
  const {live}=setup({compile});
  const waking=live.wake("a");await vi.advanceTimersByTimeAsync(0);
  const invalid={...source,files:{"App.tsx":"<"}};
  live.previewDraft("a",invalid,1,"code");
  await vi.advanceTimersByTimeAsync(600);
  expect(live.getState()).toMatchObject({phase:"compile-failed",source:invalid});
  finish(compiled);await waking;
  expect(live.getState()).toMatchObject({phase:"compile-failed",source:invalid});
});
```

`compiled` in the existing fixture is typed CompileResult; narrow it with `if(!compiled.ok) throw new Error("fixture")` before spreading compiled.screen if TypeScript does not retain its constant discriminant. Run `pnpm --filter @meld/web test live-controller live-state` red before edits, then green. Extend the sleep test with a real Draft: first save blocks, change files during snapshot wait, resolve it, and assert the second write uses its returned base and the latest files. This pairs controller departure coverage with the H5 serialized-drain fixture.

### H4/H5: define the uncertain version writer

**Files:** `L/edit-target.ts`, `L/edit-target.test.ts`. One writer belongs to one draft, with one captured ambiguous operation. It does not share failure state across screens. Failed link extraction before an RPC is an ordinary error; only a thrown RPC or error response can set the uncertain capture. A busy/conflict response never enters content reconciliation. Preserve the failed capture through a failed authenticated read, and clear it on definitive success/conflict. H5 retry must replay the failed source and base before saving any newer typing.

```ts
type VersionWriteReply=Awaited<ReturnType<typeof saveScreenVersion>>;
type VersionWriterDeps={save:typeof saveScreenVersion;read:typeof readScreenSource};
type Uncertain={id:string;source:ScreenSource;base:string|null;links:string[]};
export function createVersionWriter(d:VersionWriterDeps){
  let uncertain:Uncertain|null=null;
  async function write(id:string,source:ScreenSource,base:string|null,links:string[],retry?:true):Promise<VersionWriteReply>{
    if(retry){
      const previous=uncertain;
      if(!previous || previous.id!==id || previous.base!==base
        || previous.source.kind!==source.kind || previous.source.entry!==source.entry
        || !sameFiles(previous.source.files,source.files))return {status:"error"};
      let head:Awaited<ReturnType<typeof readScreenSource>>;
      try{head=await d.read(id);}catch{return {status:"error"};}
      if(head.status!=="ok")return {status:"error"};
      if(head.screen.versionId!==base){
        uncertain=null;
        if(!head.screen.legacy && head.screen.source.kind===source.kind
          && head.screen.source.entry===source.entry && sameFiles(head.screen.source.files,source.files))
          return {status:"saved",versionId:head.screen.versionId};
        return {status:"conflict",versionId:head.screen.versionId};
      }
    }
    // Preserve immutable bytes for an explicit Retry, even if the user types later.
    const capture:Uncertain={id,source:{...source,files:{...source.files}},base,links:[...links]};
    let result:VersionWriteReply;
    try{result=await d.save({screenId:id,baseVersionId:base,files:capture.source.files,kind:capture.source.kind,entry:capture.source.entry,links:capture.links});}
    catch{result={status:"error"};}
    uncertain=result.status==="error"?capture:null;
    return result;
  }
  return {write};
}
```

Use the exact save action argument names from `D/canvas-screen-source.ts`: check them before implementing this sheet. The Plan 2 action uses `screenId`, `baseVersionId`, `files`, optional `kind`, optional `entry`, and optional `links`; it does not accept a nested `source` argument. The content comparison deliberately excludes link ordering: links are derived from these exact authored files by the worker, rather than separately editable metadata.

- [ ] Use the following concrete adapter fixture (real action result shape); run `pnpm --filter @meld/web test edit-target edit-draft` red then green.

```ts
const html=(text:string)=>({kind:"html" as const,entry:"index.html",files:{"index.html":text}});
const loaded=(text:string,versionId:string)=>({status:"ok" as const,
  screen:{legacy:false as const,screenId:"screen",versionId,formFactor:"mobile" as const,links:[],source:html(text)}});
it("reconciles only the failed capture then saves newer typing",async()=>{
  const save=vi.fn().mockResolvedValueOnce({status:"error"})
    .mockResolvedValueOnce({status:"saved",versionId:"v3"});
  const read=vi.fn().mockResolvedValue(loaded("A","v2"));
  const writer=createVersionWriter({save,read});
  const draft=createEditDraft(html("old"),"v1",
    (src,base,retry)=>writer.write("screen",src,base,[],retry),async()=>null);
  draft.replace(html("A").files);await draft.flush();
  draft.replace(html("B").files);await draft.retry();
  expect(save.mock.calls.map(([arg])=>[{kind:arg.kind,entry:arg.entry,files:arg.files},arg.baseVersionId])).toEqual([[html("A"),"v1"],[html("B"),"v2"]]);
  expect(read).toHaveBeenCalledExactlyOnceWith("screen");
  expect(draft.getState()).toMatchObject({status:"clean",base:"v3",source:html("B")});
  draft.dispose();
});
it("keeps a same-base busy response as conflict",async()=>{
  const save=vi.fn().mockResolvedValueOnce({status:"error"})
    .mockResolvedValueOnce({status:"conflict",versionId:"v1"});
  const read=vi.fn().mockResolvedValue(loaded("A","v1"));
  const writer=createVersionWriter({save,read});
  await writer.write("screen",html("A"),"v1",[]);
  expect(await writer.write("screen",html("A"),"v1",[],true)).toEqual({status:"conflict",versionId:"v1"});
  expect(save).toHaveBeenCalledTimes(2);
});
it("rejects a divergent acknowledged head",async()=>{
  const save=vi.fn().mockResolvedValue({status:"error"});
  const writer=createVersionWriter({save,read:vi.fn().mockResolvedValue(loaded("other","v2"))});
  await writer.write("screen",html("A"),"v1",[]);
  expect(await writer.write("screen",html("A"),"v1",[],true)).toEqual({status:"conflict",versionId:"v2"});
  expect(save).toHaveBeenCalledOnce();
});
```

Add a legacy capture using kind html and original version, a failed read followed by a successful Retry, and a non-retry conflict with matching content; the last case must perform no head read. The board conversion path remains independently idempotent through its SQL mapping. Its existing mapping response must be read and compared before adopting it as saved; failed reads retain original draft and offer Retry.

### H4: relink publication, acknowledgement and backfill ordering

**Files:** `B/design-screen-board.ts`, `B/design-screen-board.test.ts`, `B/excalidraw-board.tsx`, `L/live-source.ts`. Keep this work attached to H4; do not mix it into unrelated board persistence changes. Add optional `reconcileConversions?:()=>Promise<void>` to BoardDeps and await it at the start of backfillDesignScreens and ensureDesignScreen. It must complete successfully before either adds a frame. If lookup fails, leave existing scene alone and return a load diagnostic; do not guess that an unmapped frame is new. The callback itself never calls ensureDesignScreen, so it cannot recurse.

```ts
export function relinkConvertedFrames(deps:BoardDeps,from:string,to:string,publish:()=>void){
  const original=frameLink(from), replacement=frameLink(to);
  const elements=deps.api.getSceneElementsIncludingDeleted().map(element=>
    element.type==="embeddable" && element.link===original
      ?newElementWith(element,{link:replacement}):element);
  // Seed the new store cache before invoking this helper. Hold room-local UI
  // notifications until all three ownership changes have run in this stack.
  publish(); // drafts.alias(from,to); live.retargetSource(from,to)
  deps.api.updateScene({elements,captureUpdate:CaptureUpdateAction.IMMEDIATELY});
}
```

Implement the room-local publication hold as a shared synchronous batch: draft registry notifications and live controller notifications queue while its depth is nonzero and publish at the outermost finally. Board scene update executes inside that batch. Subscriber exceptions must not skip the scene update or other queued subscribers. Keep the original cache record as a fallback; deleting it is unnecessary for Plan 3. This avoids tying correctness to an unimplemented board-save acknowledgement hook. A reload whose old link remains on disk reads the durable mapping and relinks before backfill. An ordinary failed board save keeps its existing error notice and mapping; the next load can repair it.

```ts
export function createPublicationBatch(){
  let depth=0;
  const queued=new Set<()=>void>();
  const notify=(fn:()=>void)=>{if(depth)queued.add(fn);else fn();};
  function batch(run:()=>void){
    depth++;
    try{run();}finally{
      if(--depth===0){
        const pending=[...queued];queued.clear();
        for(const fn of pending){try{fn();}catch(error){console.error(error);}}
      }
    }
  }
  return {batch,notify};
}
```

The plan's earlier requirement to retain cache until acknowledgement is satisfied by retaining it for the room lifetime. Do not remove original keys when aliasing; they still locate the same Draft. Relink only the captured room's scene; after navigation queue repair for a later load of that room. A successful source save remains acknowledged even if scene repair needs retry.

- [ ] Add a fixture with two embeddables sharing frameLink("old") and one unrelated arrow. Save a copy of all element fields, call relinkConvertedFrames, and assert the two links change while IDs, x/y, width/height, groupIds, ordering, bindings and arrow reference remain identical. Count embeddables before/after and after backfill; both counts remain two. Mock read conversion to reject and assert backfill does not call loadDocument or updateScene. Resolve it to the new ID on the next call and assert relink occurs before loadDocument. Run `pnpm --filter @meld/web test design-screen-board live-source` red/green.

Legacy regeneration must use the existing renderer rather than trusting a snapshot. H4's loadLegacy adapter calls loadRoomScreen and the same buildFramePreviewDoc inputs already used by loadDesignDocument in the board. H4's double read in the earlier sheet remains mandatory. Add this source-resolver test with the actual readSource signature:

```ts
it("rebuilds a legacy snapshot without persisting or executing its picture",async()=>{
  const id="e5000000-0000-4000-8000-000000000001";
  const key=`ds-${id}`;
  const legacy={status:"ok" as const,screen:{legacy:true as const,screenId:id,versionId:"v1",formFactor:"mobile" as const}};
  const readSource=vi.fn().mockResolvedValue(legacy);
  const loadLegacy=vi.fn().mockResolvedValue('<main>restored</main><script>window.restored=1</script>');
  const store={get:vi.fn().mockReturnValue({id:key,rev:1,html:"<main>picture</main>",snapshot:true})};
  const result=await resolveLiveSource(key,{roomId:"room",store,readSource,loadLegacy});
  expect(result?.source.files["index.html"]).toContain("window.restored=1");
  expect(result?.source.files["index.html"]).not.toContain("picture");
  expect(result?.target).toEqual({kind:"legacy",screenId:id,versionId:"v1"});
  expect(readSource).toHaveBeenCalledTimes(2);
  readSource.mockResolvedValueOnce(legacy).mockResolvedValueOnce({...legacy,screen:{...legacy.screen,versionId:"v2"}});
  expect(await resolveLiveSource(key,{roomId:"room",store,readSource,loadLegacy})).toBeNull();
});
```

### H8c: explicit preview and diagnostics ownership

**Files:** `L/hand-edit-panel.tsx`, `L/hand-edit-panel.test.tsx`, `B/excalidraw-board.tsx`. One board-owned coordinator subscribes to each draft when attaching it to the registry. UI mutations route through its edit function; async save/base updates publish state but never trigger another preview. Track diagnostics by Draft object, rather than an alias string, and revision. Use a cached external-store snapshot and publish only actual updates.

```ts
type Origin="code"|"tweak"|"history";
function edit(draft:Draft,boardId:string,origin:Origin,change:()=>void){
  const revision=draft.getState().revision;
  change();
  const after=draft.getState();
  if(after.revision===revision)return;
  selected=null;
  live.setPickEnabled(false);
  // Runs in the same event turn; do not wait for a React effect or worker.
  live.previewDraft(boardId,after.source,after.revision,origin);
}
const issuesByDraft=new Map<Draft,{revision:number;issues:CompileError[]}>();
function onDraftIssues(boardId:string,revision:number,issues:CompileError[]){
  const draft=drafts.get(boardId);
  if(!draft || draft.getState().revision!==revision)return;
  issuesByDraft.set(draft,{revision,issues});
  notifyPanel();
}
function visibleIssues(draft:Draft){
  const value=issuesByDraft.get(draft);
  return value?.revision===draft.getState().revision?value.issues:[];
}
```

`notifyPanel` is the panel's external-store publisher, with stable snapshots until selection, revision, save status or issues change. Extend commitTweak's preview seam to perform the same synchronous invalidation immediately after draft.replace. Route successful Reload latest through edit(...,"history",...) after its read resolves; preserve its revision guard. Capture board key and frame ID before starting the read, and preview only if that same draft remains active; a late read for asleep A never mounts over B. Code changes use origin code, Tweak origin tweak, undo/redo/reload origin history. Ordinary saves and aliases perform no editor replacement. Unit tests subscribe to the real coordinator and assert: code edit makes pick unavailable before timers run, stale diagnostics do not publish, current failure publishes, a base-only save acknowledgement produces zero compiler calls, and aliasing retains editor host node and selection identity only if revision is unchanged.

### H9: durable persistence assertion after reload

**Files:** add `D/canvas-screen-source-fake.hand-edit.test.ts` beside the fake, modify `D/canvas-screen-source-fake.ts`, create `D/canvas-screen-source-test-actions.ts` for the guarded async server action, and extend `e2e/canvas-excalidraw-live.spec.ts`. Keep persistence probes out of production routes. Add an E2E-only server action `readCanvasEditTestState(screenId)` in the new server-action module (the fake store remains server-only), guarded by the same E2E mode check as other fakes. It returns only `{versionId,versionCount,source}` for the authenticated editor's room using the existing fake screen/version stores. The browser hook calls it through the dev harness; it must not expose the service role or take a client-supplied user identity. Add its declaration to the existing window.__orionBoard test interface, as optional only for E2E mode. Include these files in H9's file map. Assert unit tests deny a foreign room and non-E2E mode. This is a test fixture API, never a production editor feature.

The browser test uses the E2E-only probe and existing helpers; add this to the picked-colour specimen after Copy, before and after sleeping. Its result reads the server's version store rather than the registry. Version count must increase exactly once for this one edit; using a unique pasted screen keeps tests isolated.

```ts
const readPersisted=()=>page.evaluate(async(id)=>{
  const board=window.__orionBoard!;
  if(!board.readCanvasEditTestState)throw new Error("E2E persistence probe unavailable");
  return board.readCanvasEditTestState(id.replace(/^ds-/,""));
},id);
// Capture `before` immediately after paste, before changing the colour.
const before=await readPersisted();
// After the colour change and Copy, force sleep before the 2 s idle save.
await page.keyboard.press("Escape");
await expect(live).toHaveCount(0);
await expect.poll(async()=> (await readPersisted()).versionCount).toBe(before.versionCount+1);
const saved=await readPersisted();
expect(saved.versionId).not.toBe(before.versionId);
expect(saved.source.files["App.tsx"]).toBe(copied);
await page.reload();
await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
expect(await readPersisted()).toEqual(saved);
await doubleClickScreen(page,id);
await expect(page.frameLocator("iframe[data-orion-live]").getByRole("button",{name:"Start"}))
  .toHaveCSS("background-color","rgb(18, 52, 86)");
expect((await readPersisted()).versionCount).toBe(saved.versionCount);
```

The `before` capture belongs before the edit in the original specimen; do not paste the complete excerpt after Copy. Read from the same isolated test server without restarting it between save and reload. Use its separate configured test port, never the user's preview server. The fake store verifies reload persistence for the browser suite; scratch pgTAP verifies database persistence and lock semantics independently. Mac clipboard/download/picking still require the actual WebKit acceptance pass from H9; Chromium results cannot satisfy that gate.

### Review-finding closure map

| Finding | Required implementation and regression gate |
| --- | --- |
| Worker reply union/error settlement | H3 defines SourceSuccess/SourceFailure and rejects matching pending calls; include malformed reply + disposal tests |
| Picking stale rendered offsets | H3/H6 ActiveDocument + installedRevision gate; equal-length edit during debounce and after failure |
| Conversion loses newer compiled edit | Stable ActiveDocument mutated in place on retarget; deferred B compiles under new alias, frame identity preserved |
| Preview interrupts sleep | departing guard before await; original-key final flush; history edit during delayed snapshot cannot change attempt |
| Versioned/legacy lost replies | createVersionWriter captures exact failed operation; explicit authenticated Retry; unchanged-base busy and diverged-head cases |
| Initial spinner never settles | draft-compile-failed transition when installedRevision is null; initial deferred compile then failing edit |
| Missing implementation/test seams | H4 relink/reconciliation, H8 coordinator, H9 persisted count/reload; scratch concurrency runbook below |

### H1/H4: reproducible two-session scratch runbook

The following creates committed fixtures from the existing pgTAP setup without running its assertions, solely in the branch-pure disposable scratch database. H1/H4 migrations must already have been applied there as specified above. Use a fresh disposable database per run; the fixed IDs intentionally fail on reuse. The SCRATCH_DB_URL must identify that disposable database, never the linked/shared Supabase project. Save output under `.context/plan3-sql-review/`. This runbook is an implementation deliverable, not a claim that SQL has run during plan revision.

```bash
mkdir -p .context/plan3-sql-review
python3 - <<'PY'
from pathlib import Path
fixture=Path('supabase/tests/canvas_screen_source.test.sql').read_text()
setup=fixture.split('set local role authenticated;',1)[0]
setup='\n'.join(line for line in setup.splitlines() if not line.startswith('select plan('))
Path('.context/plan3-sql-review/setup.sql').write_text(setup+'\ncommit;\n')
PY
psql -X -v ON_ERROR_STOP=1 "$SCRATCH_DB_URL" -f .context/plan3-sql-review/setup.sql
```

Save these as `.context/plan3-sql-review/a.sql` and `b.sql`, respectively. Open A first; its SELECT returns and its transaction remains open holding the conversion advisory lock and screen row lock. B must block until A commits. A uses the authenticated owner and all authorization takes place through the actual RPC.

```sql
-- a.sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
select public.convert_canvas_board_screen(
  'e4000000-0000-4000-8000-000000000001','concurrency-frame','Concurrent',
  '{"index.html":"<main>A</main>"}','index.html','mobile','{}');
-- Leave this transaction open. Start B, observe it blocking, then type COMMIT in A.
```

```sql
-- b.sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
select public.convert_canvas_board_screen(
  'e4000000-0000-4000-8000-000000000001','concurrency-frame','Concurrent',
  '{"index.html":"<main>B</main>"}','index.html','mobile','{}');
commit;
```

Run in separate terminals with `psql -X -v ON_ERROR_STOP=1 "$SCRATCH_DB_URL"`, then `\i .context/plan3-sql-review/a.sql` or b.sql. Preserve each transcript. After both commit, run this as scratch admin; it must return 1, 1, 1 and A's exact files. B must return existing=true and the same IDs, with no appended version. B's application adapter must report conflict when comparing B against stored A.

```sql
select count(*) as mappings,count(distinct s.id) as screens,count(distinct v.id) as versions,
  min(v.files::text) as files
from canvas_edit_private.board_screen_conversions m
join public.design_screens s on s.id=m.screen_id
join public.design_screen_versions v on v.screen_id=s.id
where m.room_id='e4000000-0000-4000-8000-000000000001'
  and m.board_screen_id='concurrency-frame';
```

For H1's busy-save serialization, keep the same fixture and open transaction A as scratch admin:

```sql
begin;
update public.design_screens set updating=true
where id=(select screen_id from canvas_edit_private.board_screen_conversions
  where room_id='e4000000-0000-4000-8000-000000000001' and board_screen_id='concurrency-frame');
-- Start B below; observe its save block, then COMMIT A.
```

In B, resolve the committed conversion ID through the authorized read RPC, then attempt save on the matching head. It must block until A commits and then return status=conflict. Run the count query again as admin; head, files and version count remain unchanged and updating stays true.

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
select public.save_canvas_screen_version(s.id,s.current_version_id,
  '{"index.html":"<main>blocked</main>"}','{}','html','index.html')
from public.design_screens s
where s.id=public.read_canvas_board_conversion(
  'e4000000-0000-4000-8000-000000000001','concurrency-frame');
commit;
```

Reset updating=false only in this disposable fixture and repeat the same matching-base save: it must succeed and add exactly one version. Roll back a new conversion in A, then repeat it in B and confirm B creates exactly one screen; this proves no orphan mapping survives a rollback. Do not run a test reset against a shared project. Include these transcripts alongside pgTAP and the migration diff in the separate schema review.

### Planning self-check and execution limits

- Revision reviewed against `0e6592be` action types and existing controller/browser fixtures. Source exports remain authored files; static snapshots never become executable source.
- Worker reply union contains an error alternative; the client checks operation, ID and result shape. Worker-only runtime imports remain covered by the bundle gate.
- Installed revision and departing state belong to one stable ActiveDocument. Aliases preserve that record; real source mutations invalidate it synchronously.
- Retry uses the exact failed capture/base before newer edits. A busy or divergent write remains conflict. Retry never acknowledges unchanged-base content without a successful guarded write.
- Backfill awaits conversion repair, while original cache and registry aliases survive for the room lifetime. Conversion never creates a second physical frame.
- Full database application, runtime integration tests, browser checks and Mac acceptance remain execution work. Planning checks must not be reported as passing those tests.
