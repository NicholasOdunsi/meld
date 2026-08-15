"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import {
  computeDanglingTargets,
  serializeSketch,
  type SketchLayout,
} from "@meld/prototype";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";
import type { CanvasSketchSelection } from "@/features/canvas/use-canvas-selection";
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
  selection = null,
  canvasScreens = [],
}: {
  roomId: string;
  access: "edit" | "view";
  screens: RoomDesignScreen[];
  selection?: CanvasSketchSelection | null;
  // The canvas's screen->key/flow-node projection, so Generate/Regenerate can
  // hand the generator the semantic-key context (existing screens + dangling
  // targets). Defaults to "nothing known" so a caller that doesn't yet have
  // one -- or a unit test -- degrades to no context rather than throwing.
  canvasScreens?: CanvasScreen[];
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
  // A selected screen frame that contains sketch shapes retargets Generate at
  // that frame's screen and hands the serialized layout to the generator, so
  // the sketch informs the prompt instead of being ignored. The layout is
  // derived unconditionally from a non-null selection (even with zero sketch
  // shapes) -- an empty layout is a harmless no-op for the prompt formatter
  // (slice 3b Task 3); only the visible "sketch: N shapes" affordance is
  // gated on there being shapes to report.
  const sketchLayout: SketchLayout | null = selection
    ? serializeSketch(selection.sketchShapes, selection.frame)
    : null;

  // Semantic-key generation context (replaces both the T1 "Build next step"
  // buttons and the old flow-node-driven NEXT STEPS block): every keyed
  // screen already on the canvas, plus any target key an existing screen's
  // button points at but no screen yet fulfils, so the generator can link a
  // newly generated screen to them by key instead of guessing. Omitted
  // entirely (like layout) when there is nothing to report -- an empty
  // canvas or one with no keyed screens yet -- rather than sending an
  // empty-but-present context on every call.
  const existingScreens = canvasScreens
    .filter((candidate): candidate is CanvasScreen & { screenKey: string } =>
      Boolean(candidate.screenKey))
    .map((candidate) => ({ key: candidate.screenKey, name: candidate.name }));
  const danglingTargets = computeDanglingTargets(
    canvasScreens.map((candidate) => ({
      screenKey: candidate.screenKey,
      actions: candidate.preview?.actions ?? [],
    })),
  );
  // Every shared layout at least one canvas screen already composes into,
  // distinct by key, so a new/regenerated screen can be told to reuse one
  // instead of the generator guessing a fresh shell every time (Phase 2).
  // Mirrors existingScreens' filter+map shape above.
  const existingLayouts = canvasScreens
    .filter(
      (candidate): candidate is CanvasScreen & { layoutKey: string; layoutName: string } =>
        Boolean(candidate.layoutKey) && Boolean(candidate.layoutName),
    )
    .map((candidate) => ({ key: candidate.layoutKey, name: candidate.layoutName }))
    .filter(
      (layout, index, all) => all.findIndex((other) => other.key === layout.key) === index,
    );
  const generationContext =
    existingScreens.length > 0 || danglingTargets.length > 0 || existingLayouts.length > 0
      ? { existingScreens, danglingTargets, existingLayouts }
      : undefined;

  const handleGenerate = () => {
    if (!trimmedInstruction) return;
    if (selection) {
      void generation.start({
        screenId: selection.targetScreenId,
        instruction: trimmedInstruction,
        layout: sketchLayout ?? undefined,
        context: generationContext,
      });
      return;
    }
    void generation.start({ instruction: trimmedInstruction, context: generationContext });
  };

  const handleRegenerate = (screen: RoomDesignScreen) => {
    if (!trimmedInstruction) return;
    const layout =
      selection?.targetScreenId === screen.id ? sketchLayout ?? undefined : undefined;
    void generation.start({
      screenId: screen.id,
      instruction: trimmedInstruction,
      layout,
      context: generationContext,
    });
  };

  const handleRestore = async (screen: RoomDesignScreen, versionId: string) => {
    setRestoring({ screenId: screen.id, versionId });
    const result = await restoreDesignScreenVersion({ screenId: screen.id, versionId });
    setRestoring(null);
    if (result.status === "restored") router.refresh();
  };

  return (
    <VStack gap={2} padding={2} width="100%" data-testid="screen-composer">
      {selection && selection.sketchShapes.length > 0 ? (
        <Badge
          variant="info"
          icon="▦"
          label={`sketch: ${selection.sketchShapes.length} shapes`}
        />
      ) : null}
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
