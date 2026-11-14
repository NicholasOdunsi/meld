"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/VStack";
import { readRoomExcalidrawBoard } from "./room-board-actions";
import type { SavedBoard } from "./board-persistence";

const ExcalidrawBoard = dynamic(
  () => import("./excalidraw-board").then((module) => module.ExcalidrawBoard),
  { ssr: false, loading: () => <Text>Loading board…</Text> },
);

export function BoardLoader(props: { boardId?: string; access: "edit" | "view"; roomId?: string }) {
  const [loaded, setLoaded] = useState<{ roomId: string; revision: number; board: SavedBoard } | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!props.roomId) return;
    let active = true;
    readRoomExcalidrawBoard(props.roomId).then((result) => {
      if (!active) return;
      if (result.status === "ok") {
        setLoaded({ roomId: props.roomId!, revision: result.revision, board: { version: 1, elements: result.elements, screens: result.screens } });
        setError(false);
      } else setError(true);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [props.roomId, attempt]);
  if (!props.roomId) return <ExcalidrawBoard {...props} />;
  if (error) return <VStack padding={3} gap={2}><Text role="alert">Could not load this room canvas.</Text><Button label="Retry" onClick={() => { setError(false); setAttempt((value) => value + 1); }} /></VStack>;
  if (!loaded || loaded.roomId !== props.roomId) return <Text>Loading room canvas…</Text>;
  return <ExcalidrawBoard key={props.roomId} {...props} initialBoard={loaded.board} initialRevision={loaded.revision} />;
}
