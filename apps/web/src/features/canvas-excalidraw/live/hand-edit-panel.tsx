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
import { addPickedElement, commitTweak, inspectPickedElement, shiftTag, tagFile, type ElementChip, type Selected } from "./element-session";
import type { LiveController } from "./live-controller";
import { usedColours } from "./colour-palette";
import { rgbToHex } from "./inspector-values";
import { LivePanel, type LivePanelTab } from "./live-panel";
import type { ScreenCompiler } from "./screen-compiler";
import { TweakPanel } from "./tweak-panel";
import { pageIsDark } from "./page-dark";

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
  name?: string;
  onClose: () => void;
  onTabChange: (tab: LivePanelTab) => void;
  title?: string;
};

// Fits the existing 280px LayoutPanel. Keep this component keyed by Draft,
// never attempt, source revision or a converted board alias.
export function HandEditPanel({ draft, boardId, tab, compiler, live, picked, readOnly, issues, identity, onAddElement, onReselect, name, onClose, onTabChange, title = "Screen" }: HandEditPanelProps) {
  const state = useSyncExternalStore(draft.subscribe, draft.getState, draft.getState);
  const liveState = useSyncExternalStore(live.subscribe, live.getState, live.getState);
  const selected = useRef<Selected | null>(null);
  const [inspected, setInspected] = useState<{ selected: Selected; fields: NonNullable<Inspection> } | null>(null);
  const [codeOpened, setCodeOpened] = useState(tab === "code");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const target = useRef({ draft, boardId });
  useEffect(() => { target.current = { draft, boardId }; }, [draft, boardId]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; selected.current = null; }; }, []);

  const invalidate = useCallback(() => {
    selected.current = null;
    setInspected(null);
  }, []);
  useEffect(() => {
    let previous = live.getState();
    return live.subscribe(() => {
      const next = live.getState();
      if (next.attempt !== previous.attempt || next.phase === "asleep" || next.phase === "stopped") invalidate();
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
      }
    });
    return () => { cancelled = true; if (selected.current === capture) selected.current = null; };
  // Board aliases retain an existing pick; only a new picked event rebinds it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, draft, compiler]);

  // Mutations preview in this event turn. Base/save status publications never
  // drive preview, and therefore cannot reset the editor or compile twice.
  function preview(source: ScreenSource, revision: number, origin: "code" | "tweak" | "history") {
    invalidate();
    // Only a tweak keeps its selection; code and history edits drop it.
    if (origin !== "tweak") onReselect?.(null);
    live.previewDraft(boardId, source, revision, origin);
  }
  function edit(origin: "code" | "history", change: () => void) {
    if (readOnly) return;
    const before = draft.getState().revision;
    change();
    const after = draft.getState();
    if (after.revision !== before) preview(after.source, after.revision, origin);
  }
  function tweak(value: Tweak) {
    const capture = selected.current;
    if (readOnly || !capture) return;
    const previous = draft.getState().source.files[tagFile(capture.src)] ?? "";
    void commitTweak(draft, capture, value, compiler, () => selected.current, (source, revision) => {
      const next = source.files[tagFile(capture.src)];
      // The edit is confined to the element, so it grew or shrank by the file's change in length.
      if (next !== undefined) onReselect?.(shiftTag(capture.src, next.length - previous.length));
      preview(source, revision, "tweak");
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
  const addReason = !onAddElement ? "Add to chat will be available when chat is connected." : readOnly ? "Editing access is required to add an element." : !valid ? "Pick an element first." : !identity?.() ? "Save this screen before adding an element." : state.status === "conflict" || state.status === "error" ? "Save this screen before adding an element." : undefined;
  // Once Code is opened, retain its host while switching tabs or aliases.
  const showCode = tab === "code" || codeOpened;
  const codeLoaded = useCallback(() => setCodeOpened(true), []);
  const undo = () => edit("history", () => draft.undo());
  const redo = () => edit("history", () => draft.redo());
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
  const computed = valid?.selected.computed ?? null;
  const used = useMemo(
    () => (valid ? usedColours(state.source.files, [computed?.color, computed?.backgroundColor].map(css => (css ? rgbToHex(css) : null)).filter((hex): hex is string => !!hex)) : []),
    [valid, computed, state.source.files],
  );
  return (
    <LivePanel title={title} tab={tab} onTabChange={onTabChange} onClose={onClose} history={{ canUndo, canRedo, onUndo: undo, onRedo: redo }} onKeyDown={onKeyDown}>
      <VStack gap={3}>
        {readOnly ? <Banner status="info" title="Read-only screen" description="You can read, copy and download the source." /> : null}
        {state.status === "error" ? <Banner status="error" title="This screen could not be saved" endContent={<Button label="Retry" size="sm" isDisabled={readOnly} clickAction={() => draft.retry()} />} /> : null}
        {state.status === "conflict" ? <Banner status="warning" title="This screen changed elsewhere" description="Reload the latest version to continue." endContent={<Button label="Reload latest" size="sm" isDisabled={readOnly} isLoading={busy} onClick={() => { void reload(); }} />} /> : null}
        {issues.length && tab === "tweak" ? <List density="compact" header={<Text type="label">Preview problems</Text>}>{issues.map((issue, index) => <ListItem key={`${index}-${issue.message}`} label={issue.message} description={issue.file || undefined} />)}</List> : null}
        {tab === "tweak" && valid && !readOnly ? <TweakPanel label={valid.selected.label} fields={valid.fields} computed={computed} used={used} onTweak={tweak} onAdd={() => { const capture = selected.current; if (capture && !readOnly && identity) void addPickedElement(draft, capture, () => selected.current, identity, onAddElement); }} canAdd={!addReason} addReason={addReason} /> : null}
        {showCode ? <VStack hidden={tab !== "code"} style={tab === "code" ? undefined : { display: "none" }} gap={0}><Suspense fallback={<Text type="supporting">Loading code editor…</Text>}><EditorHost onReady={codeLoaded}><CodeEditor source={state.source} issues={[...issues]} readOnly={readOnly} onChange={files => edit("code", () => draft.replace(files))} onUndo={undo} onRedo={redo} name={name} dark={pageIsDark()} /></EditorHost></Suspense></VStack> : null}
        {liveState.phase === "stopped" ? <Text type="supporting">Reload the live screen to pick an element.</Text> : null}
      </VStack>
    </LivePanel>
  );
}
function EditorHost({ onReady, children }: { onReady: () => void; children: ReactNode }) {
  useEffect(() => { onReady(); }, [onReady]);
  return children;
}
