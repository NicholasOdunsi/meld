"use client";

import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { restoreDesignScreenVersion, type RoomDesignScreen } from "../design-screen-generation";
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
  const [restoringScreenId, setRestoringScreenId] = useState<string | null>(null);
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

  const handleRestore = async (screen: RoomDesignScreen) => {
    if (!screen.current_version_id) return;
    setRestoringScreenId(screen.id);
    const result = await restoreDesignScreenVersion({
      screenId: screen.id,
      versionId: screen.current_version_id,
    });
    setRestoringScreenId(null);
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
                  <HStack gap={2} vAlign="center">
                    <Button
                      label="Regenerate"
                      variant="secondary"
                      size="sm"
                      isLoading={isGenerating}
                      isDisabled={isGenerating || trimmedInstruction.length === 0}
                      onClick={() => handleRegenerate(screen)}
                    />
                    <Button
                      label="Restore"
                      variant="secondary"
                      size="sm"
                      isLoading={restoringScreenId === screen.id}
                      isDisabled={
                        restoringScreenId === screen.id || !screen.current_version_id
                      }
                      onClick={() => handleRestore(screen)}
                    />
                  </HStack>
                ) : null}
              </VStack>
            );
          })}
        </VStack>
      ) : null}
    </VStack>
  );
}
