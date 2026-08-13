"use client";

import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  listDesignScreenVersions,
  restoreDesignScreenVersion,
  type DesignScreenVersion,
  type RoomDesignScreen,
} from "../design-screen-generation";
import { useDesignScreenGeneration } from "../use-design-screen-generation";

function screenStateLabel(screen: RoomDesignScreen): "empty" | "building" | "built" {
  if (screen.updating) return "building";
  return screen.state;
}

function screenStateVariant(label: "empty" | "building" | "built") {
  if (label === "built") return "success" as const;
  if (label === "building") return "accent" as const;
  return "neutral" as const;
}

// Restore only ever targets a PRIOR version -- restoring the screen's current
// version onto itself is a no-op clone, so the current version is filtered
// out and never offered a Restore action.
function ScreenVersionHistory({
  screen,
  restoringVersionId,
  onRestore,
}: {
  screen: RoomDesignScreen;
  restoringVersionId: string | null;
  onRestore: (versionId: string) => void;
}) {
  const [versions, setVersions] = useState<DesignScreenVersion[] | null>(null);

  useEffect(() => {
    let disposed = false;
    void listDesignScreenVersions(screen.id).then((result) => {
      if (!disposed) setVersions(result);
    });
    return () => {
      disposed = true;
    };
  }, [screen.id]);

  const priorVersions = (versions ?? []).filter(
    (version) => version.id !== screen.current_version_id,
  );
  if (priorVersions.length === 0) return null;

  return (
    <VStack gap={1} width="100%" data-testid={`screen-versions-${screen.id}`}>
      <Text type="supporting" color="secondary">Prior versions</Text>
      {priorVersions.map((version) => (
        <HStack key={version.id} gap={2} vAlign="center">
          <Text type="supporting" color="primary">{version.createdAt}</Text>
          <Button
            label="Restore"
            variant="secondary"
            size="sm"
            isLoading={restoringVersionId === version.id}
            isDisabled={restoringVersionId !== null}
            onClick={() => onRestore(version.id)}
          />
        </HStack>
      ))}
    </VStack>
  );
}

export function ScreenComposer({
  roomId,
  access,
  screens,
}: {
  roomId: string;
  access: "edit" | "view";
  screens: RoomDesignScreen[];
}) {
  const router = useRouter();
  const [instruction, setInstruction] = useState("");
  const [restoring, setRestoring] = useState<{ screenId: string; versionId: string } | null>(null);
  const generation = useDesignScreenGeneration({
    roomId,
    access,
    onScreenReady: () => router.refresh(),
  });
  const isGenerating = generation.status === "queued" || generation.status === "running";

  if (access === "view") return null;

  const trimmedInstruction = instruction.trim();

  const handleGenerate = () => {
    if (!trimmedInstruction) return;
    void generation.start({ instruction: trimmedInstruction });
  };

  const handleRegenerate = (screen: RoomDesignScreen) => {
    if (!trimmedInstruction) return;
    void generation.start({ screenId: screen.id, instruction: trimmedInstruction });
  };

  const handleRestore = async (screen: RoomDesignScreen, versionId: string) => {
    setRestoring({ screenId: screen.id, versionId });
    const result = await restoreDesignScreenVersion({ screenId: screen.id, versionId });
    setRestoring(null);
    if (result.status === "restored") router.refresh();
  };

  return (
    <VStack gap={2} padding={2} width="100%" data-testid="screen-composer">
      <TextArea
        label="Screen instruction"
        isLabelHidden
        value={instruction}
        placeholder="Describe the screen you want to generate"
        rows={3}
        maxLength={4000}
        onChange={setInstruction}
        htmlName="screen-instruction"
      />
      <HStack gap={2} vAlign="center">
        <Button
          label="Generate"
          size="sm"
          isLoading={isGenerating}
          isDisabled={isGenerating || trimmedInstruction.length === 0}
          onClick={handleGenerate}
        />
        {isGenerating ? (
          <HStack gap={1} vAlign="center">
            <Spinner size="sm" label="Generating screen" />
            <Text type="supporting" color="secondary">Building screen</Text>
          </HStack>
        ) : null}
        {generation.status === "failed" ? (
          <Text type="supporting" color="secondary">
            {generation.message ?? "Screen generation did not complete."}
          </Text>
        ) : null}
      </HStack>
      {screens.length > 0 ? (
        <VStack gap={2} width="100%">
          {screens.map((screen) => {
            const stateLabel = screenStateLabel(screen);
            const isBuilt = stateLabel === "built";
            return (
              <VStack key={screen.id} gap={1} width="100%">
                <HStack gap={2} vAlign="center">
                  <StatusDot variant={screenStateVariant(stateLabel)} label={stateLabel} />
                  <Text type="supporting" color="primary">
                    {screen.name} — {stateLabel}
                  </Text>
                </HStack>
                {isBuilt ? (
                  <VStack gap={1} width="100%">
                    <HStack gap={2} vAlign="center">
                      <Button
                        label="Regenerate"
                        variant="secondary"
                        size="sm"
                        isLoading={isGenerating}
                        isDisabled={isGenerating || trimmedInstruction.length === 0}
                        onClick={() => handleRegenerate(screen)}
                      />
                    </HStack>
                    <ScreenVersionHistory
                      screen={screen}
                      restoringVersionId={
                        restoring?.screenId === screen.id ? restoring.versionId : null
                      }
                      onRestore={(versionId) => void handleRestore(screen, versionId)}
                    />
                  </VStack>
                ) : null}
              </VStack>
            );
          })}
        </VStack>
      ) : null}
    </VStack>
  );
}
