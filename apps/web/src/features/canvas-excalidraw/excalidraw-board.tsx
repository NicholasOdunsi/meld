"use client";

import "@excalidraw/excalidraw/index.css";
import { Excalidraw, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { addScreenFrame, navigateFrame, nextFramePosition } from "./board-actions";
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
    };
  }
}

export function ExcalidrawBoard({ access, roomId }: { boardId?: string; access: "edit" | "view"; roomId?: string }) {
  const store = useMemo(() => createScreenStore(), []);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [building, setBuilding] = useState(false);
  const [instruction, setInstruction] = useState("");
  // A ref, because state updates are async and a fast double-click must not slip through.
  const buildingRef = useRef(false);

  useEffect(() => () => {
    delete window.__orionBoard;
  }, []);

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
        addFrames: (count, key) => {
          for (let index = 0; index < count; index += 1) {
            addFixture(next, key, { x: (index % 5) * 520, y: Math.floor(index / 5) * 700 });
          }
        },
      };
    },
    [addFixture],
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
    <VStack gap={0} style={{ height: "100vh" }}>
      <HStack padding={3} gap={2} wrap="wrap" style={{ background: "var(--color-background-surface)" }}>
        <Text type="label">Canvas lab · Excalidraw spike</Text>
        <Button label="Add sample screen" size="sm" isDisabled={!api || access === "view"} onClick={() => api && addFixture(api, "sample")} />
        <Button label="Add probe screen" size="sm" variant="ghost" isDisabled={!api || access === "view"} onClick={() => api && addFixture(api, "probe")} />
        <Button label="Add loop screen" size="sm" variant="ghost" isDisabled={!api || access === "view"} onClick={() => api && addFixture(api, "loop")} />
        <TextInput label="Describe this screen" size="sm" value={instruction} onChange={setInstruction} isDisabled={access === "view"} />
        <Button label="Build screen" size="sm" variant="primary" isDisabled={!selectedFrameId || building || access === "view"} onClick={() => void buildScreen()} />
        {status ? <Text role="status">{status}</Text> : null}
      </HStack>
      <VStack style={{ flex: 1, minHeight: 0 }} role="application" aria-label="Board workspace">
        <Excalidraw
          viewModeEnabled={access === "view"}
          excalidrawAPI={onApi}
          onChange={(elements, appState) => {
            const selected = elements.find((element) => appState.selectedElementIds[element.id] && !element.isDeleted && (element.type === "frame" || element.type === "magicframe"));
            setSelectedFrameId(selected ? selected.id : null);
          }}
          validateEmbeddable={(link) => isFrameLink(link)}
          renderEmbeddable={(element) => {
            const screenId = screenIdFromLink(element.link);
            if (!screenId || !api) return null;
            return (
              <FrameHost
                screenId={screenId}
                store={store}
                onNavigate={(screenKey) => navigateFrame(api, element.id, screenKey)}
              />
            );
          }}
        />
      </VStack>
    </VStack>
  );
}
