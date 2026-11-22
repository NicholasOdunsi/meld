"use client";

import { type KeyboardEvent, type ReactNode, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { CompileError } from "@meld/screen-runtime";
import type { Inspection, Tweak } from "@meld/screen-runtime/edit/types";
import type { ScreenSource } from "@meld/screen-runtime/source";
import type { Draft } from "./edit-draft";
import { runHistory } from "./draft-history";
import { parseElementTag } from "./element-tag";
import { addPickedElement, commitTweak, inspectPickedElement, shiftTag, tagFile, type ElementChip, type Selected } from "./element-session";
import type { LiveController } from "./live-controller";
import { usedColours } from "./colour-palette";
import { rgbToHex } from "./inspector-values";
import { LivePanel, type LivePanelTab } from "./live-panel";
import type { ScreenCompiler } from "./screen-compiler";
import { TweakPanel } from "./tweak-panel";
import { pageIsDark } from "./page-dark";

// An element's identity across edits: its tag moves its end when a tweak changes its text, never its start.
function elementKey(src: string): string {
  const tag = parseElementTag(src);
  return tag ? `${tag.file}:${tag.start}` : src;
}

const CodeEditor = lazy(() => import("./code-editor"));
export type HandEditPanelProps = {
  draft: Draft;
  boardId: string;
  tab: LivePanelTab;
  compiler: ScreenCompiler;
  live: LiveController;
  picked: Selected | null;
  readOnly: boolean;
  issues: readonly CompileError[];
  identity?: () => { screenId: string } | null;
  onAddElement?: (chip: ElementChip) => void;
  // The element to select again once an edit has recompiled the frame; null drops it.
  onReselect?: (src: string | null) => void;
  // The element an edit asked to select again, while that is still pending (null when none).
  reselect?: string | null;
  // Shown on the Tweak tab when it cannot be chosen (nothing selected, or not editable).
  tweakDisabledReason?: string;
  name?: string;
  onClose: () => void;
  onTabChange: (tab: LivePanelTab) => void;
  title?: string;
};

// Fits the existing 280px LayoutPanel. Keep this component keyed by Draft,
// never attempt, source revision or a converted board alias.
export function HandEditPanel({ draft, boardId, tab, compiler, live, picked, readOnly, issues, identity, onAddElement, onReselect, reselect = null, tweakDisabledReason, name, onClose, onTabChange, title = "Screen" }: HandEditPanelProps) {
  const state = useSyncExternalStore(draft.subscribe, draft.getState, draft.getState);
  const liveState = useSyncExternalStore(live.subscribe, live.getState, live.getState);
  const selected = useRef<Selected | null>(null);
  // The last inspection. It outlives an edit: while the edited element is selected again and read
  // again, the panel keeps showing it (pending) so the body never unmounts and focus stays put.
  const [inspected, setInspected] = useState<{ selected: Selected; fields: NonNullable<Inspection> } | null>(null);
  // The element the carried inspection stands for (its tag), while a tweak or Undo is being applied.
  // Only that element's reselect or fresh pick may show it; anything else must never see it.
  const [carry, setCarry] = useState<string | null>(null);
  const [codeOpened, setCodeOpened] = useState(tab === "code");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const target = useRef({ draft, boardId });
  useEffect(() => { target.current = { draft, boardId }; }, [draft, boardId]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; selected.current = null; }; }, []);

  const invalidate = useCallback(() => {
    selected.current = null;
  }, []);
  useEffect(() => {
    let previous = live.getState();
    return live.subscribe(() => {
      const next = live.getState();
      if (next.attempt !== previous.attempt || next.phase === "asleep" || next.phase === "stopped") invalidate();
      if (next.phase === "asleep" || next.phase === "stopped") setCarry(null);
      previous = next;
    });
  }, [live, invalidate]);
  useEffect(() => {
    selected.current = picked && picked.boardId === boardId && picked.revision === draft.getState().revision ? picked : null;
    const capture = selected.current;
    if (!capture) return;
    let cancelled = false;
    void inspectPickedElement(draft, capture, compiler, () => selected.current).then(fields => {
      if (!cancelled && selected.current === capture) {
        if (fields) setInspected({ selected: capture, fields });
        else { selected.current = null; setInspected(null); }
        setCarry(null);
      }
    });
    return () => { cancelled = true; if (selected.current === capture) selected.current = null; };
  // Board aliases retain an existing pick; only a new picked event rebinds it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, draft, compiler]);

  // Mutations preview in this event turn. Base/save status publications never
  // drive preview, and therefore cannot reset the editor or compile twice.
  // A tweak keeps its selection itself; undo and redo pass the element's place in the new source
  // as `reselect`; a code edit (or a reload) drops it.
  function preview(source: ScreenSource, revision: number, origin: "code" | "tweak" | "history", again: string | null = null, tweaked: string | null = null) {
    invalidate();
    if (origin !== "tweak") onReselect?.(again);
    // A tweak, or Undo/Redo that found the element again, keeps showing the last values until that element is back.
    setCarry(origin === "tweak" ? tweaked : again);
    live.previewDraft(boardId, source, revision, origin);
  }
  function edit(change: () => void) {
    if (readOnly) return;
    const before = draft.getState();
    change();
    const after = draft.getState();
    if (after.revision === before.revision) return;
    preview(after.source, after.revision, "code");
  }
  // Undo and redo can change anything in the file: runHistory finds the selected element again in the new text.
  function history(kind: "undo" | "redo") {
    if (readOnly) return;
    runHistory(kind, {
      draft, live, boardId, picked: selected.current, reselect,
      onReselect: src => onReselect?.(src),
      // Like a tweak, Undo/Redo that found the element again keeps showing the last values until that element is back.
      onPreview: again => { invalidate(); setCarry(again); },
    });
  }
  function tweak(value: Tweak) {
    const capture = selected.current;
    if (readOnly || !capture) return;
    const previous = draft.getState().source.files[tagFile(capture.src)] ?? "";
    void commitTweak(draft, capture, value, compiler, () => selected.current, (source, revision) => {
      const next = source.files[tagFile(capture.src)];
      // The edit is confined to the element, so it grew or shrank by the file's change in length.
      const moved = next !== undefined ? shiftTag(capture.src, next.length - previous.length) : capture.src;
      if (next !== undefined) onReselect?.(moved);
      preview(source, revision, "tweak", null, moved);
    });
  }
  async function reload() {
    const owner = { draft, boardId };
    const before = live.getState();
    const revision = draft.getState().revision;
    setBusy(true);
    try {
      await draft.reloadLatest();
      const after = live.getState();
      if (mounted.current && target.current.draft === owner.draft && target.current.boardId === owner.boardId && before.phase !== "asleep" && after.phase !== "asleep" && before.screenId === owner.boardId && after.screenId === owner.boardId && before.frameId === after.frameId && draft.getState().revision !== revision) {
        preview(draft.getState().source, draft.getState().revision, "history");
      }
    } finally { if (mounted.current) setBusy(false); }
  }
  const valid = inspected && inspected.selected === picked && inspected.selected.revision === state.revision ? inspected : null;
  // A pick for the source on screen whose inspection has not come back yet.
  const pickedFresh = !!picked && picked.boardId === boardId && picked.revision === state.revision;
  const shown = valid ?? (carry !== null && inspected && (reselect !== null || (pickedFresh && picked.src === carry)) ? inspected : null);
  // Once nothing is shown the carry is spent (a reselect that timed out, a pick of something else).
  if (carry !== null && shown === null) setCarry(null);
  // The Tweak body only renders for a selected element on an editable screen (see below).
  const addReason = !onAddElement ? "Add to chat will be available when chat is connected." : !identity?.() || state.status === "conflict" || state.status === "error" ? "Save this screen before adding an element." : undefined;
  // Once Code is opened, retain its host while switching tabs or aliases.
  const showCode = tab === "code" || codeOpened;
  const codeLoaded = useCallback(() => setCodeOpened(true), []);
  const undo = () => history("undo");
  const redo = () => history("redo");
  const canUndo = !readOnly && state.canUndo;
  const canRedo = !readOnly && state.canRedo;
  // Cmd+Z / Shift+Cmd+Z while focus is in the panel. Text fields (the code editor included) keep their own undo.
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key.toLowerCase() !== "z" || !(event.metaKey || event.ctrlKey) || event.altKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(".cm-editor, input, textarea, [contenteditable]:not([contenteditable=false])")) return;
    event.preventDefault();
    // Excalidraw listens for the same shortcut on the document; it must not undo the board as well.
    event.stopPropagation();
    if (event.shiftKey) { if (canRedo) redo(); } else if (canUndo) undo();
  }
  const computed = shown?.selected.computed ?? null;
  const used = useMemo(
    () => (shown ? usedColours(state.source.files, [computed?.color, computed?.backgroundColor].map(css => (css ? rgbToHex(css) : null)).filter((hex): hex is string => !!hex)) : []),
    [shown, computed, state.source.files],
  );
  return (
    <LivePanel title={title} tab={tab} onTabChange={onTabChange} onClose={onClose} onKeyDown={onKeyDown} disabledTabs={tweakDisabledReason ? { tweak: tweakDisabledReason } : undefined}>
      <VStack gap={3}>
        {readOnly ? <Banner status="info" title="Read-only screen" description="You can read, copy and download the source." /> : null}
        {state.status === "error" ? <Banner status="error" title="This screen could not be saved" endContent={<Button label="Retry" size="sm" isDisabled={readOnly} clickAction={() => draft.retry()} />} /> : null}
        {state.status === "conflict" ? <Banner status="warning" title="This screen changed elsewhere" description="Reload the latest version to continue." endContent={<Button label="Reload latest" size="sm" isDisabled={readOnly} isLoading={busy} onClick={() => { void reload(); }} />} /> : null}
        {issues.length && tab === "tweak" ? <List density="compact" header={<Text type="label">Preview problems</Text>}>{issues.map((issue, index) => <ListItem key={`${index}-${issue.message}`} label={issue.message} description={issue.file || undefined} />)}</List> : null}
        {tab === "tweak" && shown && !readOnly ? <TweakPanel label={shown.selected.label} selectionKey={elementKey(shown.selected.src)} fields={shown.fields} computed={computed} used={used} isPending={shown !== valid} onTweak={tweak} onAdd={() => { const capture = selected.current; if (capture && identity) void addPickedElement(draft, capture, () => selected.current, identity, onAddElement); }} canAdd={!addReason && shown === valid} addReason={addReason} /> : null}
        {showCode ? <VStack hidden={tab !== "code"} style={tab === "code" ? undefined : { display: "none" }} gap={0}><Suspense fallback={<Text type="supporting">Loading code editor…</Text>}><EditorHost onReady={codeLoaded}><CodeEditor source={state.source} issues={[...issues]} readOnly={readOnly} onChange={files => edit(() => draft.replace(files))} onUndo={undo} onRedo={redo} name={name} dark={pageIsDark()} /></EditorHost></Suspense></VStack> : null}
        {liveState.phase === "stopped" ? <Text type="supporting">Reload the live screen to select an element.</Text> : null}
      </VStack>
    </LivePanel>
  );
}
function EditorHost({ onReady, children }: { onReady: () => void; children: ReactNode }) {
  useEffect(() => { onReady(); }, [onReady]);
  return children;
}
