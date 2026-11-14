"use client";

import dynamic from "next/dynamic";
import { Text } from "@astryxdesign/core/Text";

const ExcalidrawBoard = dynamic(
  () => import("./excalidraw-board").then((module) => module.ExcalidrawBoard),
  { ssr: false, loading: () => <Text>Loading board…</Text> },
);

export function BoardLoader(props: { boardId?: string; access: "edit" | "view" }) {
  return <ExcalidrawBoard {...props} />;
}
