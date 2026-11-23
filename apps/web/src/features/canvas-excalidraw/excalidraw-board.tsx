"use client";

import "@excalidraw/excalidraw/index.css";
import { CaptureUpdateAction, Excalidraw, convertToExcalidrawElements, getSceneVersion, newElementWith, restoreElements, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useTheme } from "@astryxdesign/core/theme";
import { addScreenFrame, nextFramePosition } from "./board-actions";
import { boardStorageKey, loadBoard, saveBoard } from "./board-persistence";
import type { readCanvasEditTestState } from "@/features/design/canvas-screen-source-test-actions";
import type { SavedBoard } from "./board-persistence";
import { saveRoomExcalidrawBoard } from "./room-board-actions";
import { collectSketch } from "./build-screen";
import { promptOnlySketch } from "./prompt-only-sketch";
import { FIXTURES, type FixtureKey } from "./fixtures";
import { FrameHost } from "./frame-host";
import { isFrameLink, screenIdFromLink } from "./frame-link";
import { createOwnAiGenerator } from "./own-ai-generator";
import { createRoomOwnAiDeps } from "./own-ai-deps";
import { postSketch } from "./post-sketch";
import { ensureStarSection, findStarSection } from "./star-section";
import { createScreenStore } from "./screen-store";
import { buildWithFallback, describeOutcome, type ScreenGenerator } from "./screen-generator";
import { isOrionFrameV2UserAgent } from "@/features/native/user-agent";
import { buildFramePreviewDoc } from "@/features/canvas/screen-preview-doc";
import { previewChromeCss, previewTheme } from "@/features/canvas-next/preview-theme";
import { createCanvasScreen } from "@/features/design/canvas-screen-source";
import { nameCanvasScreen } from "@/features/design/canvas-screen-name";
import { backfillDesignScreens, focusDesignScreen, type BoardDeps } from "./design-screen-board";
import { listBuiltRoomScreens, loadRoomScreen } from "./load-screen";
import "./chrome/orion-board.css";
import { CanvasDock } from "./chrome/canvas-dock";
import { hostPillItems, ScreenPill, type HostAction } from "./chrome/screen-pill";
import { ShapePanel } from "./chrome/shape-panel";
import { applicableControls, isClosedLine, patchFor, readShapeStyle, shapePatch, type ShapeStyle } from "./chrome/shape-style";
import { describeSelection, sameSelection, type SelectionSummary } from "./chrome/selection";
import { activeToolFor, dockToolForActive, type DockTool } from "./chrome/tools";
import { dotGridStyle } from "./chrome/dot-grid";
import { useNoPageBounce } from "./chrome/no-page-bounce";
import { useTriangleShortcut, useTriangleTool } from "./chrome/use-triangle-tool";
import { ZoomControl } from "./chrome/zoom-control";
import { createFrameZoomBatch, frameZoomAnchor, frameZoomTarget, zoomAnchor, zoomAroundCenter, type Viewport } from "./chrome/zoom";
import { createCompilerLease } from "./live/compiler-lease";
import { createHandEditing } from "./live/hand-editing";
import { HandEditPanel } from "./live/hand-edit-panel";
import { isInsideScreen, screenFrameAt } from "./live/live-hit";
import { LiveCodeView, LivePanel, type LivePanelTab } from "./live/live-panel";
import { liveIssues, liveSourceOf } from "./live/live-state";
import { INSPECTOR_CLASS, InspectorThemeStyle } from "./live/inspector-theme";
import { pillSpecs } from "./live/pill-model";
import { useDraftHistory } from "./live/use-draft-history";
import { boardHistoryKey, createFrameHistoryGate, userIsActive } from "./live/history-keys";
import { useInspectorPanel } from "./live/use-inspector-panel";
import { sleepingDocument } from "./live/placeholder";
import { loadRuntimeBundle } from "./live/runtime-bundle";
import { createScreenCompiler } from "./live/screen-compiler";
import { createPastedScreen } from "./paste/create-pasted-screen";
import { PasteDialog } from "./paste/paste-dialog";

declare global {
  interface Window {
    __orionBoard?: {
      api: ExcalidrawImperativeAPI;
      readCanvasEditTestState?:typeof readCanvasEditTestState;
      roomId: string | null;
      /** True once a room board has its saved scene on screen. */
      ready: () => boolean;
      convert: typeof convertToExcalidrawElements;
      addFixture: (key: FixtureKey) => void;
      addFrames: (count: number, key: FixtureKey) => void;
      setScreen: (id: string, html: string) => void;
      focusStar: (taskId: string, title: string) => boolean;
      focusScreen: (designScreenId: string) => Promise<boolean>;
      focusAll: () => boolean;
    };
  }
}

export function ExcalidrawBoard({ boardId, access, roomId, initialBoard, initialRevision = 0, onCode, screenActionsFor, shapeActionsFor, testPersistence }: {
  boardId?: string; access: "edit" | "view"; roomId?: string; initialBoard?: SavedBoard; initialRevision?: number;
  onCode?: () => void;
  testPersistence?:typeof readCanvasEditTestState;
  screenActionsFor?: (selection: SelectionSummary) => readonly HostAction[];
  shapeActionsFor?: (selection: SelectionSummary) => readonly HostAction[];
}) {
  const { token } = useTheme();
  const toast = useToast();
  const sectionColor = token("--color-accent");
  const storageKey = boardStorageKey(boardId);
  const saved = useMemo(() => roomId ? initialBoard ?? null : loadBoard(window.localStorage, storageKey), [initialBoard, roomId, storageKey]);
  const store = useMemo(() => {
    const created = createScreenStore();
    for (const screen of saved?.screens ?? []) created.set(screen);
    return created;
  }, [saved]);
  useNoPageBounce();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  useEffect(() => { apiRef.current = api; }, [api]);
  // Babel lives in a worker that starts the first time a screen goes live.
  const compiler = useMemo(() => createScreenCompiler(), []);
  const compilerLease=useMemo(()=>createCompilerLease(compiler),[compiler]);
  const editing = useMemo(() => createHandEditing({
    roomId:roomId??null,access,store,compiler,api:()=>api,runtimeBundle:loadRuntimeBundle,
    loadLegacy:async(id)=>{
      if(!roomId)return null;
      const screen=await loadRoomScreen(roomId,id);
      return screen && !screen.sourceKind && screen.preview ? buildFramePreviewDoc(screen,previewTheme(getComputedStyle(document.body)),previewChromeCss):null;
    },
  }),[access,api,compiler,roomId,store]);
  const live=editing.live;
  const clearActiveEmbeddable=useCallback(()=>{apiRef.current?.updateScene({ appState: { activeEmbeddable: null } });},[]);
  const { liveState, panelTab, edit, visible: panelVisible, tweakDisabled, showCode, afterWake, onTabChange, close: closePanel, toggleEdit } = useInspectorPanel(editing, clearActiveEmbeddable);
  const history = useDraftHistory(editing);
  const draftStatuses=useSyncExternalStore(editing.drafts.subscribe,editing.drafts.getSnapshot,editing.drafts.getSnapshot);
  useEffect(()=>{
    compilerLease.retain();editing.retain();
    return()=>{const saved=editing.flushAll();editing.release();compilerLease.release(saved);};
  },[compilerLease,editing]);
  const openPanel=useCallback(async(id:string,frameId:string|undefined,tab:LivePanelTab,options?:{edit?:boolean})=>{
    const attempt=await live.wake(id,undefined,frameId),current=live.getState();
    if(current.phase==="asleep" || current.attempt!==attempt || current.frameId!==frameId)return;
    if(current.screenId!==id && (!editing.drafts.get(id) || editing.drafts.get(id)!==editing.drafts.get(current.screenId)))return;
    // Waking opens no panel for an editable screen: it appears when something is selected, or Code is asked for.
    // A screen that can't be edited (read-only, or no editable source) opens Code: there is nothing to select.
    // The pill's Edit on a sleeping screen asks for Edit to start once it is awake (an editable one only).
    afterWake(tab,options);
  },[afterWake,editing,live]);
  // A copied embeddable shares its source. Only the requested copy runs it.
  const liveFrameId = liveState.phase === "asleep" ? undefined : liveState.frameId
    ?? api?.getSceneElements().find((element) => element.type === "embeddable" && screenIdFromLink(element.link) === liveState.screenId)?.id;
  useEffect(() => {
    const onMessage = (event: MessageEvent) => live.handleMessage(event);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      live.dispose();
    };
  }, [compiler, live]);
  const liveDraft = liveState.phase === "asleep" ? undefined : editing.drafts.get(liveState.screenId);
  const liveEditable = !!liveDraft && editing.canEdit(liveDraft);
  const scenePoint = useCallback((event: { clientX: number; clientY: number }) => {
    const current = apiRef.current;
    return current ? viewportCoordsToSceneCoords(event, current.getAppState()) : null;
  }, []);
  const onBoardDoubleClick = useCallback((event: ReactMouseEvent) => {
    if (!(event.target instanceof HTMLCanvasElement) || !apiRef.current) return;
    const point = scenePoint(event);
    const hit = point ? screenFrameAt(apiRef.current.getSceneElements(), point) : null;
    if (hit) void openPanel(hit.screenId, hit.element.id, "tweak");
  }, [openPanel, scenePoint]);
  const onBoardPointerDown = useCallback((event: ReactPointerEvent) => {
    const state = live.getState();
    if (state.phase === "asleep" || !(event.target instanceof HTMLCanvasElement) || !apiRef.current) return;
    const point = scenePoint(event);
    if (point && !isInsideScreen(apiRef.current.getSceneElements(), state.screenId, point, liveFrameId)) void live.sleep();
  }, [live, liveFrameId, scenePoint]);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saveConflict, setSaveConflict] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const revision = useRef(initialRevision);
  const saving = useRef(false);
  const conflicted = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flushRef = useRef<() => void>(() => {});
  const lastSavedVersion = useRef(-1);
  const receivedInitialScene = useRef(false);
  const pending = useRef<readonly ExcalidrawElement[] | null>(null);

  const flush = useCallback(() => {
    clearTimeout(saveTimer.current);
    const elements = pending.current;
    if (!elements) return;
    pending.current = null;
    if (roomId) {
      if (conflicted.current) return;
      if (saving.current) { pending.current = elements; return; }
      saving.current = true;
      let savedSuccessfully = false;
      void saveRoomExcalidrawBoard(roomId, revision.current, [...elements] as SavedBoard["elements"], store.all()).then((result) => {
        if (result.status === "saved") {
          savedSuccessfully = true;
          revision.current = result.revision;
          lastSavedVersion.current = getSceneVersion(elements);
          setSaveFailed(false);
          setHasUnsavedChanges(pending.current !== null);
        } else if (result.status === "conflict") {
          conflicted.current = true;
          setSaveConflict(true);
        } else {
          pending.current ??= elements;
          setSaveFailed(true);
        }
      }).catch(() => {
        pending.current ??= elements;
        setSaveFailed(true);
      }).finally(() => {
        saving.current = false;
        if (pending.current && !conflicted.current && savedSuccessfully) flushRef.current();
      });
      return;
    }
    const succeeded = saveBoard(window.localStorage, storageKey, elements, store.all());
    if (succeeded) lastSavedVersion.current = getSceneVersion(elements);
    setSaveFailed(!succeeded);
    if (succeeded) setHasUnsavedChanges(false);
  }, [roomId, storageKey, store]);

  useEffect(() => { flushRef.current = flush; }, [flush]);

  const queueSave = useCallback((elements: readonly ExcalidrawElement[]) => {
    if (access === "view" || conflicted.current) return;
    pending.current = elements;
    setHasUnsavedChanges(true);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 400);
  }, [access, flush]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<DockTool | null>("select");
  const [selection, setSelection] = useState<SelectionSummary | null>(null);
  const [view, setView] = useState<Viewport>({ scrollX: 0, scrollY: 0, zoom: 1, width: 0, height: 0 });
  const [pasteOpen, setPasteOpen] = useState(false);
  useTriangleShortcut(api, access === "edit");
  useTriangleTool(api, access === "edit" && activeTool === "triangle", useCallback(() => setActiveTool("select"), []));
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  const applyZoom = useCallback((next: { zoom: number; scrollX: number; scrollY: number }) => {
    apiRef.current?.updateScene({ appState: { zoom: { value: next.zoom as never }, scrollX: next.scrollX, scrollY: next.scrollY } });
  }, []);
  // A pinch over the awake screen never reaches the board (the iframe takes the wheel), so the
  // frame's bridge reports it in its own px. The screen's code is untrusted: a report counts only
  // while the pointer is over that iframe (the board sees the pointer enter and leave it), its
  // point is clamped onto the frame, and a burst is applied at most once per animation frame.
  const pointerOverLive = useRef<HTMLIFrameElement | null>(null);
  const onLivePointer = useCallback((frame: HTMLIFrameElement, over: boolean) => {
    if (over) pointerOverLive.current = frame;
    else if (pointerOverLive.current === frame) pointerOverLive.current = null;
  }, []);
  const overLiveFrame = useCallback(() => {
    const frame = pointerOverLive.current, state = live.getState();
    return frame?.isConnected && state.phase !== "asleep" && frame.dataset.orionLive === state.screenId ? frame : null;
  }, [live]);
  // Cmd+Z / Shift+Cmd+Z run the awake screen's undo and redo, as the pill's buttons do, when it has
  // something to undo or redo; otherwise the keys reach the board's own undo as before. Captured on
  // the window so Excalidraw never also undoes a board element.
  const historyRef = useRef(history);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = historyRef.current;
      const direction = boardHistoryKey(event, { history: current, scope: ".orion-board" });
      if (!direction || !current) return;
      event.preventDefault();
      event.stopPropagation();
      current[direction]();
    };
    window.addEventListener("keydown", onKeyDown, true);
    // Pressed inside the screen, the keys never reach this page: the frame reports them, and a report
    // counts only when it looks like a real press there (history-keys.ts).
    const gate = createFrameHistoryGate();
    editing.setFrameHistory((direction) => {
      const state = live.getState(), focused = document.activeElement;
      if (state.phase === "asleep") return;
      const frameFocused = focused instanceof HTMLIFrameElement && focused.isConnected && focused.dataset.orionLive === state.screenId;
      if (!gate({ screenId: state.screenId, pointerOver: !!overLiveFrame(), frameFocused, userActive: userIsActive(navigator) })) return;
      const current = historyRef.current;
      if (current && (direction === "undo" ? current.canUndo : current.canRedo)) current[direction]();
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      editing.setFrameHistory(null);
    };
  }, [editing, live, overLiveFrame]);
  useEffect(() => {
    const batch = createFrameZoomBatch((run) => { requestAnimationFrame(run); }, (step) => {
      const current = apiRef.current, frame = overLiveFrame();
      if (!current || !frame) return;
      const app = current.getAppState(), rect = frame.getBoundingClientRect();
      const board = { scrollX: app.scrollX, scrollY: app.scrollY, zoom: app.zoom.value, width: app.width, height: app.height, offsetLeft: app.offsetLeft, offsetTop: app.offsetTop };
      const box = { left: rect.left, top: rect.top, width: rect.width, height: rect.height, offsetWidth: frame.offsetWidth, offsetHeight: frame.offsetHeight };
      applyZoom(zoomAroundCenter(board, frameZoomTarget(board.zoom, step), frameZoomAnchor(step.point, box, board)));
    });
    editing.setFrameZoom((zoom) => { if (overLiveFrame()) batch.push(zoom); });
    return () => {
      editing.setFrameZoom(null);
      batch.cancel();
    };
  }, [applyZoom, editing, overLiveFrame]);
  useEffect(() => store.subscribe(() => {
    if (api) queueSave(api.getSceneElementsIncludingDeleted());
  }), [api, queueSave, store]);
  const updateSelected = useCallback((change: (element: ExcalidrawElement) => ExcalidrawElement) => {
    if (!api || !selection) return;
    const ids = new Set(selection.ids);
    api.updateScene({
      elements: api.getSceneElementsIncludingDeleted().map((element) => (ids.has(element.id) ? change(element) : element)),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }, [api, selection]);
  // The selected shape's look, read from the scene so the panel follows every change (the selection summary does not).
  const [shapeInfo, setShapeInfo] = useState<{ style: ShapeStyle; type: string; closed: boolean; textSize?: number } | null>(null);
  const changeShape = useCallback((change: Partial<ShapeStyle>) => {
    const patch = shapePatch(change);
    // Each element takes only what applies to its own type (text just colour and opacity, screens and frames nothing).
    updateSelected((element) => {
      const own = patchFor(element.type, patch, isClosedLine(element as { type: string; points?: readonly (readonly [number, number])[] }));
      return Object.keys(own).length ? newElementWith(element, own as never) : element;
    });
  }, [updateSelected]);
  const changeTextSize = useCallback((size: number) => {
    if (!api || !selection) return;
    const ids = new Set(selection.ids);
    const changed = api.getSceneElementsIncludingDeleted().map((element) =>
      ids.has(element.id) && element.type === "text" ? newElementWith(element, { fontSize: size }) : element);
    api.updateScene({ elements: restoreElements(changed, null, { refreshDimensions: true }), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, [api, selection]);
  const closeShapePanel = useCallback(() => { apiRef.current?.updateScene({ appState: { selectedElementIds: {} } }); }, []);
  const [status, setStatus] = useState("");
  const [building, setBuilding] = useState(false);
  const [instruction, setInstruction] = useState("");
  // A ref, because state updates are async and a fast double-click must not slip through.
  const buildingRef = useRef(false);

  const addFixture = useCallback(
    (target: ExcalidrawImperativeAPI, key: FixtureKey, at?: { x: number; y: number }) => {
      for (const screen of FIXTURES[key].screens) store.set(screen);
      const element = addScreenFrame(target, { screenId: FIXTURES[key].frameScreenId, ...(at ?? nextFramePosition(target)) });
      // A new frame lands at the scene origin, under Excalidraw's properties panel
      // (which opens on the selected element). Centre it so its buttons are clickable.
      if (!at) target.scrollToContent(element, { animate: false });
    },
    [store],
  );

  const onApi = useCallback(
    (next: ExcalidrawImperativeAPI) => {
      setApi(next);
      const readyToFocus = () => {
        const viewport = next.getAppState();
        return (!roomId || receivedInitialScene.current)
          && viewport.width > 100 && viewport.height > 100
          && (!saved?.elements.length || next.getSceneElements().length > 0);
      };
      const screenDeps: BoardDeps = {
        api: next,
        store,
        reconcileConversions:()=>editing.reconcileConversions(next),
        loadDocument: async (designScreenId) => {
          if (!roomId) return null;
          const screen = await loadRoomScreen(roomId, designScreenId);
          if (!screen) return null;
          const html = sleepingDocument(screen, () =>
            buildFramePreviewDoc(screen, previewTheme(getComputedStyle(document.body)), previewChromeCss));
          return html ? { html, formFactor: screen.formFactor } : null;
        },
      };
      window.__orionBoard = {
        api: next,
        ...(testPersistence?{readCanvasEditTestState:testPersistence}:{}),
        roomId: roomId ?? null,
        ready: readyToFocus,
        convert: convertToExcalidrawElements,
        addFixture: (key) => addFixture(next, key),
        setScreen: (id, html) => store.set({ id, rev: (store.get(id)?.rev ?? 0) + 1, html }),
        focusScreen: async (designScreenId) => readyToFocus() && focusDesignScreen(screenDeps, designScreenId),
        focusStar: (taskId, title) => {
          if (!readyToFocus()) return false;
          const section = access === "view"
            ? findStarSection(next.getSceneElements(), taskId)
            : ensureStarSection(next, taskId, title, sectionColor);
          if (!section) return false;
          // Excalidraw applies updateScene on its next render. Focus the live element
          // after that render so newly created or recolored sections stay in view.
          requestAnimationFrame(() => {
            const current = findStarSection(next.getSceneElements(), taskId);
            if (current) next.scrollToContent(current, { fitToViewport: true, viewportZoomFactor: 0.75, animate: false });
          });
          return true;
        },
        focusAll: () => {
          if (!readyToFocus()) return false;
          const elements = next.getSceneElements();
          if (elements.length) next.scrollToContent(elements, { fitToViewport: true, viewportZoomFactor: 0.8, animate: false });
          return true;
        },
        addFrames: (count, key) => {
          for (let index = 0; index < count; index += 1) {
            addFixture(next, key, { x: (index % 5) * 520, y: Math.floor(index / 5) * 700 });
          }
        },
      };
      // In view mode these frames stay local: queueSave ignores read-only boards.
      if (roomId) {
        void (async () => {
          const deadline = Date.now() + 20_000;
          while (!readyToFocus() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 250));
          if (!readyToFocus()) return;
          try { await backfillDesignScreens(screenDeps, await listBuiltRoomScreens(roomId)); } catch { /* Canvas remains usable. */ }
        })();
      }
    },
    [access, addFixture, editing, roomId, saved, sectionColor, store, testPersistence],
  );

  const buildScreen = useCallback(async () => {
    if (!api || buildingRef.current) return;
    const candidate = api.getSceneElements().find((element) => element.id === selectedFrameId);
    const frame = candidate?.type === "frame" || candidate?.type === "magicframe" ? candidate : null;
    const prompt = instruction.trim();
    if (!frame && !prompt) return;
    buildingRef.current = true;
    setBuilding(true);
    setStatus("Building screen…");
    try {
      // The owner's connected AI first (only when a room is named); DeepSeek otherwise.
      const ownAi = roomId ? createOwnAiGenerator(createRoomOwnAiDeps(roomId)) : null;
      const deepseek: ScreenGenerator = async ({ request }) => ({ ...(await postSketch(request)), provider: null });
      const built = await buildWithFallback({
        request: frame ? await collectSketch(api, frame) : promptOnlySketch(prompt),
        instruction: prompt || "Build this sketch as a polished screen.",
        ownAi,
        fallback: deepseek,
      });
      store.set({ id: built.screenId, rev: 1, html: built.html });
      const position = frame ? { x: frame.x + frame.width + 80, y: frame.y } : nextFramePosition(api);
      const size = frame ? { width: frame.width, height: frame.height } : promptOnlySketch(prompt);
      const added = addScreenFrame(api, { screenId: built.screenId, ...position, width: size.width, height: size.height });
      if (!frame) api.scrollToContent(added, { animate: false });
      setStatus(describeOutcome(built));
    } catch (error) {
      setStatus(error instanceof Error ? `Could not build the screen: ${error.message}` : "Could not build the screen");
    } finally {
      buildingRef.current = false;
      setBuilding(false);
    }
  }, [api, instruction, roomId, selectedFrameId, store]);

  const nativeFrame = typeof navigator !== "undefined" && isOrionFrameV2UserAgent(navigator.userAgent);

  // The pill under the awake screen shows whether or not its frame is selected, so its bounds come from the scene.
  const liveFrameElement = liveFrameId ? api?.getSceneElements().find((element) => element.id === liveFrameId) : undefined;
  const pills = pillSpecs({
    phase: liveState.phase, access, hasDraft: !!liveDraft, editable: liveEditable,
    awakeScreenId: liveState.phase === "asleep" ? null : liveState.screenId,
    liveFrame: liveFrameElement ? { id: liveFrameElement.id, bounds: { x: liveFrameElement.x, y: liveFrameElement.y, width: liveFrameElement.width, height: liveFrameElement.height } } : null,
    selection,
    edit: { pressed: edit, onToggle: toggleEdit },
    history: history ? { canUndo: history.canUndo, canRedo: history.canRedo, onUndo: history.undo, onRedo: history.redo } : null,
    // Wakes the way a double-click does (interactive, no panel), then turns Edit on.
    onWakeEdit: (id, frameId) => void openPanel(id, frameId, "tweak", { edit: true }),
    onCode: (id, frameId) => void openPanel(id, frameId, "code"),
    hostScreenItems: selection?.kind === "screen" ? hostPillItems(screenActionsFor?.(selection) ?? []) : undefined,
    hostShapeItems: selection && selection.kind !== "screen" ? hostPillItems(shapeActionsFor?.(selection) ?? []) : undefined,
  });
  return (
    <VStack gap={0} width="100%" height={roomId && boardId ? "100%" : "100vh"} minHeight="var(--spacing-0)">
      <InspectorThemeStyle />
      {!nativeFrame ? <HStack padding={3} gap={2} wrap="wrap" style={{ background: "var(--color-background-surface)" }}>
        <Text type="label">{roomId ? "Sketch and build" : "Canvas lab · Excalidraw spike"}</Text>
        {!roomId ? <Button label="Add sample screen" size="sm" isDisabled={!api || access === "view"} onClick={() => api && addFixture(api, "sample")} /> : null}
        {!roomId ? <Button label="Add probe screen" size="sm" variant="ghost" isDisabled={!api || access === "view"} onClick={() => api && addFixture(api, "probe")} /> : null}
        <TextInput label="Describe this screen" size="sm" value={instruction} onChange={setInstruction} isDisabled={access === "view"} />
        <Button label="Build screen" size="sm" variant="primary" isDisabled={!api || (!selectedFrameId && !instruction.trim()) || building || access === "view"} onClick={() => void buildScreen()} />
        {roomId ? <Button label="Preview screen" size="sm" variant="ghost" isDisabled={!selectedScreenId || hasUnsavedChanges || saveFailed || saveConflict} onClick={() => {
          if (selectedScreenId) window.open(`/api/rooms/${roomId}/canvas-preview/${selectedScreenId}`, "_blank", "noopener,noreferrer");
        }} /> : null}
        {!roomId ? <Button label="Clear board" size="sm" variant="ghost" isDisabled={!api || access === "view"} onClick={() => {
          if (!api) return;
          void live.sleep();
          clearTimeout(saveTimer.current);
          pending.current = null;
          setSelectedScreenId(null);
          if (!roomId) window.localStorage.removeItem(storageKey);
          store.clear();
          api.resetScene();
          pending.current = [];
          if (roomId) setHasUnsavedChanges(true);
          flush();
        }} /> : null}
        {status ? <Text role="status">{status}</Text> : null}
        {saveFailed ? <Text role="alert">{roomId ? "Could not save this room board." : "Could not save this board in the browser. Export is not available yet."}</Text> : null}
        {saveFailed ? <Button label="Retry save" size="sm" onClick={() => { setSaveFailed(false); flush(); }} /> : null}
        {saveConflict ? <Text role="alert">This board changed in another window, so your latest changes were not saved.</Text> : null}
        {saveConflict ? <Button label="Reload board" size="sm" variant="primary" onClick={() => window.location.reload()} /> : null}
      </HStack> : null}
      {nativeFrame && saveFailed ? <HStack padding={2} gap={2}><Text role="alert">Could not save this room board.</Text><Button label="Retry save" size="sm" onClick={() => { setSaveFailed(false); flush(); }} /></HStack> : null}
      {nativeFrame && saveConflict ? (
        <HStack padding={2} gap={2} align="center">
          <Text role="alert">This board changed in another window, so your latest changes were not saved.</Text>
          <Button label="Reload board" size="sm" variant="primary" onClick={() => window.location.reload()} />
        </HStack>
      ) : null}
      {draftStatuses.some(item=>item.status==="saving")?<Text role="status">Saving screen edits…</Text>:null}
      {draftStatuses.filter(item=>item.status==="error" || item.status==="conflict").map(item=>(
        <Banner key={item.boardId} status="error" title={item.status==="conflict"?"Screen edits conflict with another version":"Screen edits could not be saved"}>
          <Button label="Review screen edits" variant="ghost" size="sm" onClick={()=>void openPanel(item.boardId,undefined,"code")} />
        </Banner>
      ))}
      <Layout
        height="fill"
        padding={0}
        style={{ flex: 1, minHeight: 0 }}
        content={(
          <VStack
            className={`orion-board ${INSPECTOR_CLASS}`}
            height="100%"
            style={{ position: "relative", ...dotGridStyle(view) }}
            role="application"
            aria-label="Board workspace"
            onDoubleClick={onBoardDoubleClick}
            onPointerDownCapture={onBoardPointerDown}
          >
            <Excalidraw
              theme="dark"
              UIOptions={{ canvasActions: { changeViewBackgroundColor: false, clearCanvas: false, export: false, loadScene: false, saveToActiveFile: false, toggleTheme: false, saveAsImage: false } }}
              renderTopRightUI={() => null}
              // The dotted grid behind the board (dot-grid.ts) shows through the transparent canvas.
              initialData={{ elements: saved ? restoreElements(saved.elements as unknown as ExcalidrawElement[], null) : [], appState: { viewBackgroundColor: "transparent" }, scrollToContent: Boolean(saved) }}
              viewModeEnabled={access === "view"}
              excalidrawAPI={onApi}
              onChange={(elements, appState) => {
                const selected = elements.find((element) => appState.selectedElementIds[element.id] && !element.isDeleted && (element.type === "frame" || element.type === "magicframe"));
                setSelectedFrameId(selected ? selected.id : null);
                const screen = elements.find((element) => appState.selectedElementIds[element.id] && !element.isDeleted && element.type === "embeddable");
                setSelectedScreenId(screen ? screenIdFromLink(screen.link) : null);
                setActiveTool(dockToolForActive(appState.activeTool));
                const nextSelection = describeSelection(elements, appState.selectedElementIds);
                setSelection((current) => (sameSelection(current, nextSelection) ? current : nextSelection));
                // The panel reads the first selected element that has controls, preferring a drawn shape over text in a mix.
                const candidates = nextSelection && nextSelection.kind !== "screen"
                  ? nextSelection.ids.map((id) => elements.find((element) => element.id === id)).filter((element) => element && applicableControls(element.type, isClosedLine(element as { type: string; points?: readonly (readonly [number, number])[] })).panel)
                  : [];
                const first = candidates.find((element) => element?.type !== "text") ?? candidates[0];
                const nextInfo = first ? { style: readShapeStyle(first), type: first.type, closed: isClosedLine(first as { type: string; points?: readonly (readonly [number, number])[] }), ...(first.type === "text" ? { textSize: first.fontSize } : {}) } : null;
                setShapeInfo((current) => (JSON.stringify(current) === JSON.stringify(nextInfo) ? current : nextInfo));
                setView((current) => {
                  const next = { scrollX: appState.scrollX, scrollY: appState.scrollY, zoom: appState.zoom.value, width: appState.width, height: appState.height };
                  return current.scrollX === next.scrollX && current.scrollY === next.scrollY && current.zoom === next.zoom
                    && current.width === next.width && current.height === next.height ? current : next;
                });
                if (roomId && !receivedInitialScene.current) {
                  receivedInitialScene.current = true;
                  lastSavedVersion.current = getSceneVersion(elements);
                  return;
                }
                if (getSceneVersion(elements) !== lastSavedVersion.current) {
                  queueSave(elements);
                }
              }}
              validateEmbeddable={(link) => isFrameLink(link)}
              renderEmbeddable={(element) => {
                const screenId = screenIdFromLink(element.link);
                if (!screenId || !api) return null;
                return (
                  <FrameHost
                    screenId={screenId}
                    store={store}
                    live={element.id === liveFrameId ? live : undefined}
                    onShowCode={showCode}
                    onLivePointer={onLivePointer}
                  />
                );
              }}
            />
            {api && access === "edit" ? (
              <CanvasDock
                activeTool={activeTool}
                onSelectTool={(tool) => api.setActiveTool(activeToolFor(tool))}
                onCode={onCode ?? (roomId && access === "edit" ? () => setPasteOpen(true) : undefined)}
              />
            ) : null}
            {api && access === "edit" ? pills.map((pill) => (
              <ScreenPill key={pill.key} bounds={pill.bounds} view={view} items={pill.items} label={pill.label} testId={pill.testId} />
            )) : null}
            {api ? (
              <ZoomControl
                view={view}
                // About the selected screen, else the awake one, else the visible board's centre.
                anchor={zoomAnchor([selection?.kind === "screen" ? selection.bounds : null, liveFrameElement], view)}
                onZoom={applyZoom}
              />
            ) : null}
          </VStack>
        )}
        end={api && access === "edit" && selection && selection.kind !== "screen" && shapeInfo ? (
          <ShapePanel
            selectionKey={selection.ids.join(",")}
            style={shapeInfo.style}
            kind={shapeInfo.type === "text" ? "text" : "shape"}
            elementType={shapeInfo.type}
            closed={shapeInfo.closed}
            textSize={shapeInfo.textSize}
            onChange={changeShape}
            onTextSize={changeTextSize}
            onClose={closeShapePanel}
          />
        ) : panelVisible && liveState.phase !== "asleep" ? (
          liveDraft ? (
            <HandEditPanel key={editing.key(liveDraft)}
              draft={liveDraft} boardId={liveState.screenId} tab={panelTab}
              compiler={compiler} live={live} picked={editing.getPicked()} readOnly={!liveEditable}
              issues={editing.issues(liveDraft)}
              onReselect={editing.setReselect}
              reselect={editing.getReselect()}
              tweakDisabledReason={tweakDisabled}
              registerHistoryObserver={editing.setHistoryObserver}
              onClose={closePanel} onTabChange={onTabChange} />
          ) : (
            <LivePanel tab={panelTab} onTabChange={onTabChange} onClose={closePanel} disabledTabs={tweakDisabled ? { tweak: tweakDisabled } : undefined}>
              <LiveCodeView source={liveSourceOf(liveState)} issues={liveIssues(liveState)} />
            </LivePanel>
          )
        ) : undefined}
      />
      {roomId && access === "edit" ? (
        <PasteDialog
          isOpen={pasteOpen}
          onOpenChange={setPasteOpen}
          compile={(source) => compiler.compile(source, { tagElements: false })}
          onNotice={(message) => { toast({ type: "info", body: message, autoHideDuration: 10_000 }); }}
          onCreate={async (input) => {
            const current = apiRef.current;
            if (!current) return "error";
            const result = await createPastedScreen({
              roomId,
              view: viewRef.current,
              store,
              create: createCanvasScreen,
              addFrame: (frame) => { addScreenFrame(current, frame); },
              wake: (id) => { void openPanel(id,undefined,"tweak"); },
            }, input);
            if (result.status !== "created") return "error";
            // AI names it a moment later; if that doesn't happen the placeholder stays.
            void nameCanvasScreen({ screenId: result.screenId, placeholder: input.name, source: input.source });
            return "created";
          }}
        />
      ) : null}
    </VStack>
  );
}
