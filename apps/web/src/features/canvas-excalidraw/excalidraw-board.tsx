"use client";

import "@excalidraw/excalidraw/index.css";
import { Excalidraw, convertToExcalidrawElements, getSceneVersion, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
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
import { createScreenStore } from "./screen-store";
import { buildWithFallback, describeOutcome, type ScreenGenerator } from "./screen-generator";
import { isOrionFrameV2UserAgent } from "@/features/native/user-agent";

declare global {
  interface Window {
    __orionBoard?: {
      api: ExcalidrawImperativeAPI;
      convert: typeof convertToExcalidrawElements;
      addFixture: (key: FixtureKey) => void;
      addFrames: (count: number, key: FixtureKey) => void;
      setScreen: (id: string, html: string) => void;
    };
  }
}

export function ExcalidrawBoard({ boardId, access, roomId, initialBoard, initialRevision = 0 }: { boardId?: string; access: "edit" | "view"; roomId?: string; initialBoard?: SavedBoard; initialRevision?: number }) {
  const storageKey = boardStorageKey(boardId);
  const saved = useMemo(() => roomId ? initialBoard ?? null : loadBoard(window.localStorage, storageKey), [initialBoard, roomId, storageKey]);
  const store = useMemo(() => {
    const created = createScreenStore();
    for (const screen of saved?.screens ?? []) created.set(screen);
    return created;
  }, [saved]);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
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
  useEffect(() => store.subscribe(() => {
    if (api) queueSave(api.getSceneElementsIncludingDeleted());
  }), [api, queueSave, store]);
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
      window.__orionBoard = {
        api: next,
        convert: convertToExcalidrawElements,
        addFixture: (key) => addFixture(next, key),
        setScreen: (id, html) => store.set({ id, rev: (store.get(id)?.rev ?? 0) + 1, html }),
        addFrames: (count, key) => {
          for (let index = 0; index < count; index += 1) {
            addFixture(next, key, { x: (index % 5) * 520, y: Math.floor(index / 5) * 700 });
          }
        },
      };
    },
    [addFixture, store],
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
      <VStack style={{ flex: 1, minHeight: 0 }} role="application" aria-label="Board workspace">
        <Excalidraw
          theme="dark"
          initialData={saved ? { elements: restoreElements(saved.elements as unknown as ExcalidrawElement[], null), scrollToContent: true } : undefined}
          viewModeEnabled={access === "view"}
          excalidrawAPI={onApi}
          onChange={(elements, appState) => {
            const selected = elements.find((element) => appState.selectedElementIds[element.id] && !element.isDeleted && (element.type === "frame" || element.type === "magicframe"));
            setSelectedFrameId(selected ? selected.id : null);
            const screen = elements.find((element) => appState.selectedElementIds[element.id] && !element.isDeleted && element.type === "embeddable");
            setSelectedScreenId(screen ? screenIdFromLink(screen.link) : null);
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
              />
            );
          }}
        />
      </VStack>
    </VStack>
  );
}
