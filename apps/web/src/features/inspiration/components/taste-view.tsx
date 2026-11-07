"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type { TasteTile } from "@meld/contracts";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { addTasteDislike, saveTasteTile, type SaveTasteResult, type TasteView as View } from "../taste/taste-actions";
import { InspirationTabs } from "./inspiration-tabs";
import { TasteBoard } from "./taste-board";
import { TasteTileEditor } from "./taste-tile-editor";

const CONFLICT = "Your taste changed in the meantime. Reload and try again.";
const INVALID = "That doesn't fit this tile. Check the limits and try again.";

export function TasteView({
  workspaceId,
  initialView,
  deck,
}: {
  workspaceId: string;
  initialView: View;
  // Filled by Task 10 (pill + deck); null until then.
  deck?: (view: Extract<View, { status: "ready" }>, onDone: () => void) => ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<TasteTile | null>(null);
  const [dislike, setDislike] = useState("");
  const [error, setError] = useState<string | null>(null);
  const view = initialView;

  function handle(result: SaveTasteResult) {
    if (result.status === "saved") {
      setError(null);
      router.refresh();
    } else {
      setError(result.status === "conflict" ? CONFLICT : INVALID);
    }
  }

  const header = (
    <LayoutHeader hasDivider>
      <VStack gap={3} paddingInline={6} paddingBlock={4}>
        <HStack hAlign="between" vAlign="center">
          <Heading level={1}>Inspiration</Heading>
          {view.status === "ready" && deck ? deck(view, () => router.refresh()) : null}
        </HStack>
        <InspirationTabs workspaceId={workspaceId} active="taste" />
      </VStack>
    </LayoutHeader>
  );

  if (view.status !== "ready") {
    return (
      <Layout height="fill" header={header}>
        <LayoutContent>
          <VStack padding={6} hAlign="center">
            {view.status === "off" ? (
              <EmptyState title="Taste learning is off" description="Add a DeepSeek key to let Orion learn your taste." />
            ) : (
              <EmptyState
                title="Orion is still learning"
                description={`Save ${Math.max(view.needed - view.sortedCount, 0)} more images and Orion will draw your taste.`}
              />
            )}
          </VStack>
        </LayoutContent>
      </Layout>
    );
  }

  return (
    <Layout height="fill" header={header}>
      <LayoutContent>
        <VStack gap={4} padding={6}>
          {error ? <Banner status="error" title={error} /> : null}
          <TasteBoard board={view.board} onEdit={setEditing} />
          <HStack gap={2} vAlign="end">
            <TextInput label="Add a dislike" value={dislike} onChange={setDislike} placeholder="e.g. no gradients" />
            <Button
              label="Add"
              isDisabled={dislike.trim().length === 0}
              onClick={async () => {
                const result = await addTasteDislike({ workspaceId, text: dislike, expectedVersion: view.version });
                if (result.status === "saved") setDislike("");
                handle(result);
              }}
            />
          </HStack>
        </VStack>
        {editing ? (
          <TasteTileEditor
            key={editing}
            tile={editing}
            board={view.board}
            isOpen
            onOpenChange={(open) => !open && setEditing(null)}
            onSave={async (value) => {
              const result = await saveTasteTile({ workspaceId, tile: editing, value, expectedVersion: view.version });
              if (result.status === "saved") setEditing(null);
              handle(result);
            }}
          />
        ) : null}
      </LayoutContent>
    </Layout>
  );
}
