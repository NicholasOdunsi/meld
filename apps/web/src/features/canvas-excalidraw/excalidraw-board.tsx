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
import { collectSketch } from "./build-screen";
import { FIXTURES, type FixtureKey } from "./fixtures";
import { FrameHost } from "./frame-host";
import { isFrameLink, screenIdFromLink } from "./frame-link";
import { createOwnAiGenerator } from "./own-ai-generator";
import { createRoomOwnAiDeps } from "./own-ai-deps";
import { postSketch } from "./post-sketch";
import { createScreenStore } from "./screen-store";
import { buildWithFallback, describeOutcome, type ScreenGenerator } from "./screen-generator";

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

export function ExcalidrawBoard({ boardId, access, roomId }: { boardId?: string; access: "edit" | "view"; roomId?: string }) {
  const storageKey = boardStorageKey(boardId);
  const saved = useMemo(() => loadBoard(window.localStorage, storageKey), [storageKey]);
  const store = useMemo(() => {
    const created = createScreenStore();
    for (const screen of saved?.screens ?? []) created.set(screen);
    return created;
  }, [saved]);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSavedVersion = useRef(-1);
  const pending = useRef<readonly ExcalidrawElement[] | null>(null);

  const flush = useCallback(() => {
    clearTimeout(saveTimer.current);
    const elements = pending.current;
    if (!elements) return;
    pending.current = null;
    const succeeded = saveBoard(window.localStorage, storageKey, elements, store.all());
    if (succeeded) lastSavedVersion.current = getSceneVersion(elements);
    setSaveFailed(!succeeded);
  }, [storageKey, store]);

  const queueSave = useCallback((elements: readonly ExcalidrawElement[]) => {
    pending.current = elements;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 400);
  }, [flush]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
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
    if (!api || !selectedFrameId || buildingRef.current) return;
    const frame = api.getSceneElements().find((element) => element.id === selectedFrameId);
    if (!frame || (frame.type !== "frame" && frame.type !== "magicframe")) return;
    buildingRef.current = true;
    setBuilding(true);
    setStatus("Building screen…");
    try {
      // The owner's connected AI first (only when a room is named); DeepSeek otherwise.
      const ownAi = roomId ? createOwnAiGenerator(createRoomOwnAiDeps(roomId)) : null;
      const deepseek: ScreenGenerator = async ({ request }) => ({ ...(await postSketch(request)), provider: null });
      const built = await buildWithFallback({
        request: await collectSketch(api, frame),
        instruction: instruction.trim() || "Build this sketch as a polished screen.",
        ownAi,
        fallback: deepseek,
      });
      store.set({ id: built.screenId, rev: 1, html: built.html });
      addScreenFrame(api, { screenId: built.screenId, x: frame.x + frame.width + 80, y: frame.y, width: frame.width, height: frame.height });
      setStatus(describeOutcome(built));
    } catch (error) {
      setStatus(error instanceof Error ? `Could not build the screen: ${error.message}` : "Could not build the screen");
    } finally {
      buildingRef.current = false;
      setBuilding(false);
    }
  }, [api, instruction, roomId, selectedFrameId, store]);

  return (
    <VStack gap={0} width="100%" height={roomId ? "100%" : "100vh"} minHeight="var(--spacing-0)">
      <HStack padding={3} gap={2} wrap="wrap" style={{ background: "var(--color-background-surface)" }}>
        <Text type="label">Canvas lab · Excalidraw spike</Text>
        <Button label="Add sample screen" size="sm" isDisabled={!api || access === "view"} onClick={() => api && addFixture(api, "sample")} />
        <Button label="Add probe screen" size="sm" variant="ghost" isDisabled={!api || access === "view"} onClick={() => api && addFixture(api, "probe")} />
        <TextInput label="Describe this screen" size="sm" value={instruction} onChange={setInstruction} isDisabled={access === "view"} />
        <Button label="Build screen" size="sm" variant="primary" isDisabled={!selectedFrameId || building || access === "view"} onClick={() => void buildScreen()} />
        <Button label="Clear board" size="sm" variant="ghost" isDisabled={!api || access === "view"} onClick={() => {
          if (!api) return;
          clearTimeout(saveTimer.current);
          pending.current = null;
          window.localStorage.removeItem(storageKey);
          store.clear();
          api.resetScene();
          pending.current = [];
          flush();
        }} />
        {status ? <Text role="status">{status}</Text> : null}
        {saveFailed ? <Text role="status">Could not save this board in the browser. Export is not available yet.</Text> : null}
      </HStack>
      <VStack style={{ flex: 1, minHeight: 0 }} role="application" aria-label="Board workspace">
        <Excalidraw
          theme="dark"
          initialData={saved ? { elements: restoreElements(saved.elements as unknown as ExcalidrawElement[], null), scrollToContent: true } : undefined}
          viewModeEnabled={access === "view"}
          excalidrawAPI={onApi}
          onChange={(elements, appState) => {
            const selected = elements.find((element) => appState.selectedElementIds[element.id] && !element.isDeleted && (element.type === "frame" || element.type === "magicframe"));
            setSelectedFrameId(selected ? selected.id : null);
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
