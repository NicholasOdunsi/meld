"use client";

import "@excalidraw/excalidraw/index.css";
import { CaptureUpdateAction, Excalidraw, convertToExcalidrawElements, getSceneVersion, newElementWith, restoreElements, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useTheme } from "@astryxdesign/core/theme";
import { addScreenFrame, nextFramePosition } from "./board-actions";
import { boardStorageKey, loadBoard, saveBoard } from "./board-persistence";
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
import { readScreenSource } from "@/features/design/canvas-screen-source";
import { backfillDesignScreens, focusDesignScreen, type BoardDeps } from "./design-screen-board";
import { listBuiltRoomScreens, loadRoomScreen } from "./load-screen";
import "./chrome/orion-board.css";
import { CanvasDock } from "./chrome/canvas-dock";
import { SelectionPill, type PillSwatch, type ScreenAction } from "./chrome/selection-pill";
import { describeSelection, sameSelection, type SelectionSummary } from "./chrome/selection";
import { dockToolFor, excalidrawToolFor, type DockTool } from "./chrome/tools";
import { ZoomControl } from "./chrome/zoom-control";
import type { Viewport } from "./chrome/zoom";
import { liveScreenActions } from "./live/live-actions";
import { createLiveController } from "./live/live-controller";
import { isInsideScreen, screenFrameAt } from "./live/live-hit";
import { LiveCodeView, LivePanel, type LivePanelTab } from "./live/live-panel";
import { isAwake, liveIssues, liveSourceOf } from "./live/live-state";
import { resolveLiveSource } from "./live/live-source";
import { sleepingDocument } from "./live/placeholder";
import { loadRuntimeBundle } from "./live/runtime-bundle";
import { createScreenCompiler } from "./live/screen-compiler";

declare global {
  interface Window {
    __orionBoard?: {
      api: ExcalidrawImperativeAPI;
      roomId: string | null;
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

export function ExcalidrawBoard({ boardId, access, roomId, initialBoard, initialRevision = 0, onCode, screenActionsFor, shapeActionsFor }: {
  boardId?: string; access: "edit" | "view"; roomId?: string; initialBoard?: SavedBoard; initialRevision?: number;
  onCode?: () => void;
  screenActionsFor?: (selection: SelectionSummary) => readonly ScreenAction[];
  shapeActionsFor?: (selection: SelectionSummary) => readonly ScreenAction[];
}) {
  const { token } = useTheme();
  const sectionColor = token("--color-accent");
  const storageKey = boardStorageKey(boardId);
  const saved = useMemo(() => roomId ? initialBoard ?? null : loadBoard(window.localStorage, storageKey), [initialBoard, roomId, storageKey]);
  const store = useMemo(() => {
    const created = createScreenStore();
    for (const screen of saved?.screens ?? []) created.set(screen);
    return created;
  }, [saved]);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  useEffect(() => { apiRef.current = api; }, [api]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<LivePanelTab>("code");
  const showCode = useCallback(() => { setPanelTab("code"); setPanelOpen(true); }, []);
  // Babel lives in a worker that starts the first time a screen goes live.
  const compiler = useMemo(() => createScreenCompiler(), []);
  const live = useMemo(() => createLiveController({
    loadSource: (id) => resolveLiveSource(id, { roomId: roomId ?? null, store, readSource: readScreenSource }),
    compile: (source) => compiler.compile(source, { tagElements: true }),
    runtimeBundle: () => loadRuntimeBundle(),
    // The snapshot becomes the sleeping picture; the board saves it like any screen.
    onSnapshot: (id, html) => {
      const current = store.get(id);
      if (current && (!current.snapshot || current.html !== html)) {
        store.set({ id, rev: current.rev + 1, html, snapshot: true });
      }
    },
  }), [compiler, roomId, store]);
  const liveState = useSyncExternalStore(live.subscribe, live.getState, live.getState);
  // A copied embeddable shares its source. Only the requested copy runs it.
  const liveFrameId = liveState.phase === "asleep" ? undefined : liveState.frameId
    ?? api?.getSceneElements().find((element) => element.type === "embeddable" && screenIdFromLink(element.link) === liveState.screenId)?.id;
  useEffect(() => {
    const onMessage = (event: MessageEvent) => live.handleMessage(event);
    // Capture phase, and no defaultPrevented check: Excalidraw handles Escape
    // itself and may stop or prevent it before a bubbling listener runs.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && live.getState().phase !== "asleep") void live.sleep();
    };
    let phase = live.getState().phase;
    const unsubscribe = live.subscribe(() => {
      const next = live.getState().phase;
      if (next === phase) return;
      phase = next;
      if (next === "asleep") {
        setPanelOpen(false);
        apiRef.current?.updateScene({ appState: { activeEmbeddable: null } });
      }
      // A screen that can't compile keeps its picture and opens its errors.
      if (next === "compile-failed") showCode();
    });
    window.addEventListener("message", onMessage);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKeyDown, true);
      unsubscribe();
      live.dispose();
      compiler.dispose();
    };
  }, [compiler, live, showCode]);
  const scenePoint = useCallback((event: { clientX: number; clientY: number }) => {
    const current = apiRef.current;
    return current ? viewportCoordsToSceneCoords(event, current.getAppState()) : null;
  }, []);
  const onBoardDoubleClick = useCallback((event: ReactMouseEvent) => {
    if (!(event.target instanceof HTMLCanvasElement) || !apiRef.current) return;
    const point = scenePoint(event);
    const hit = point ? screenFrameAt(apiRef.current.getSceneElements(), point) : null;
    if (hit) void live.wake(hit.screenId, undefined, hit.element.id);
  }, [live, scenePoint]);
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
  const swatches = useMemo<PillSwatch[]>(() => [
    { label: "Ink", color: token("--color-text-primary") },
    { label: "Accent", color: token("--color-text-accent") },
    { label: "Red", color: token("--color-text-red") },
    { label: "Green", color: token("--color-text-green") },
    { label: "Yellow", color: token("--color-text-yellow") },
  ], [token]);
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
        roomId: roomId ?? null,
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
    [access, addFixture, roomId, saved, sectionColor, store],
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

  return (
    <VStack gap={0} width="100%" height={roomId && boardId ? "100%" : "100vh"} minHeight="var(--spacing-0)">
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
        {saveConflict ? <Text role="alert">This board changed in another window. Reload to see the latest version.</Text> : null}
      </HStack> : null}
      {nativeFrame && saveFailed ? <HStack padding={2} gap={2}><Text role="alert">Could not save this room board.</Text><Button label="Retry save" size="sm" onClick={() => { setSaveFailed(false); flush(); }} /></HStack> : null}
      {nativeFrame && saveConflict ? <Text role="alert">This board changed in another window. Reload to see the latest version.</Text> : null}
      <Layout
        height="fill"
        padding={0}
        style={{ flex: 1, minHeight: 0 }}
        content={(
          <VStack
            className="orion-board"
            height="100%"
            style={{ position: "relative" }}
            role="application"
            aria-label="Board workspace"
            onDoubleClick={onBoardDoubleClick}
            onPointerDownCapture={onBoardPointerDown}
          >
            <Excalidraw
              theme="dark"
              UIOptions={{ canvasActions: { changeViewBackgroundColor: false, clearCanvas: false, export: false, loadScene: false, saveToActiveFile: false, toggleTheme: false, saveAsImage: false } }}
              renderTopRightUI={() => null}
              initialData={saved ? { elements: restoreElements(saved.elements as unknown as ExcalidrawElement[], null), scrollToContent: true } : undefined}
              viewModeEnabled={access === "view"}
              excalidrawAPI={onApi}
              onChange={(elements, appState) => {
                const selected = elements.find((element) => appState.selectedElementIds[element.id] && !element.isDeleted && (element.type === "frame" || element.type === "magicframe"));
                setSelectedFrameId(selected ? selected.id : null);
                const screen = elements.find((element) => appState.selectedElementIds[element.id] && !element.isDeleted && element.type === "embeddable");
                setSelectedScreenId(screen ? screenIdFromLink(screen.link) : null);
                setActiveTool(dockToolFor(appState.activeTool.type));
                const nextSelection = describeSelection(elements, appState.selectedElementIds);
                setSelection((current) => (sameSelection(current, nextSelection) ? current : nextSelection));
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
                  />
                );
              }}
            />
            {api && access === "edit" ? (
              <CanvasDock
                activeTool={activeTool}
                onSelectTool={(tool) => api.setActiveTool({ type: excalidrawToolFor(tool) })}
                onCode={onCode}
              />
            ) : null}
            {api && selection && access === "edit" ? (
              <SelectionPill
                selection={selection}
                view={view}
                swatches={swatches}
                onStroke={(color) => updateSelected((element) => newElementWith(element, { strokeColor: color }))}
                onStrokeWidth={(width) => updateSelected((element) => newElementWith(element, { strokeWidth: width }))}
                onFontSize={(size) => {
                  if (!api || !selection) return;
                  const ids = new Set(selection.ids);
                  const changed = api.getSceneElementsIncludingDeleted().map((element) =>
                    ids.has(element.id) && element.type === "text" ? newElementWith(element, { fontSize: size }) : element);
                  api.updateScene({ elements: restoreElements(changed, null, { refreshDimensions: true }), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
                }}
                screenActions={[
                  ...liveScreenActions(selection, selection.screenId !== null && selection.ids[0] === liveFrameId && isAwake(liveState, selection.screenId), {
                    onOpenLive: (id) => void live.wake(id, undefined, selection.ids[0]),
                    onCode: (id) => void live.wake(id, undefined, selection.ids[0]).then(() => {
                      const current = live.getState();
                      if (current.phase !== "asleep" && current.screenId === id && current.frameId === selection.ids[0]) showCode();
                    }),
                  }),
                  ...(screenActionsFor?.(selection) ?? []),
                ]}
                shapeActions={shapeActionsFor?.(selection)}
              />
            ) : null}
            {api ? (
              <ZoomControl view={view} onZoom={(next) => api.updateScene({ appState: { zoom: { value: next.zoom as never }, scrollX: next.scrollX, scrollY: next.scrollY } })} />
            ) : null}
          </VStack>
        )}
        end={panelOpen && liveState.phase !== "asleep" ? (
          <LivePanel title="Screen code" tab={panelTab} onTabChange={setPanelTab} onClose={() => setPanelOpen(false)}>
            <LiveCodeView source={liveSourceOf(liveState)} issues={liveIssues(liveState)} />
          </LivePanel>
        ) : undefined}
      />
    </VStack>
  );
}
