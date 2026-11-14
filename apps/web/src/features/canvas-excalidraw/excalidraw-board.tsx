"use client";

import "@excalidraw/excalidraw/index.css";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useState } from "react";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

declare global {
  interface Window {
    __orionBoard?: { api: ExcalidrawImperativeAPI };
  }
}

export function ExcalidrawBoard({ access }: { boardId?: string; access: "edit" | "view" }) {
  const [, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  return (
    <VStack gap={0} style={{ height: "100vh" }}>
      <HStack padding={3} gap={2} style={{ background: "var(--color-background-surface)" }}>
        <Text type="label">Canvas lab · Excalidraw spike</Text>
      </HStack>
      <VStack style={{ flex: 1, minHeight: 0 }} role="application" aria-label="Board workspace">
        <Excalidraw
          viewModeEnabled={access === "view"}
          excalidrawAPI={(api) => {
            setApi(api);
            window.__orionBoard = { api };
          }}
        />
      </VStack>
    </VStack>
  );
}
