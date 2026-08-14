"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import type { FlowDocument } from "@meld/contracts";
import { downstreamActionSteps, serializeSketch, type OutgoingStep, type SketchLayout } from "@meld/prototype";
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
  flow = null,
  canvasScreens = [],
}: {
  roomId: string;
  access: "edit" | "view";
  screens: RoomDesignScreen[];
  selection?: CanvasSketchSelection | null;
  // The canvas's own flow (derived from shapes) and screen->flow-node map, so
  // Generate/Regenerate can hand the generator (A1) the target screen's
  // downstream journey steps. Both default to "nothing known" so a caller
  // that doesn't yet have a flow -- or a unit test -- degrades to no steps
  // rather than throwing.
  flow?: FlowDocument | null;
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

  // The generator (A1) tags each nav action with the journey step it leads to,
  // so it needs the target screen's downstream steps from the flow. Looked up
  // by screen id -> flow node id (via the canvas screen projection) then
  // traced through the flow; either piece being unavailable (no flow yet, or
  // a screen not pinned to a node) just means no steps to offer -- not an
  // error, since a screen can still be generated without journey context.
  const stepsForFlowNode = (flowNodeId: string): OutgoingStep[] => {
    if (!flow) return [];
    return downstreamActionSteps(flow, flowNodeId);
  };

  const stepsForScreen = (screenId: string): OutgoingStep[] => {
    const flowNodeId = canvasScreens.find((candidate) => candidate.id === screenId)?.flowNodeId;
    if (!flowNodeId) return [];
    return stepsForFlowNode(flowNodeId);
  };

  // "Build next step" affordance (Task 4): once a screen is selected, offer a
  // button per downstream journey step from *that* screen's flow node, so the
  // user can generate the next screen in the flow without re-selecting it.
  // Each target screen is looked up by flow node id -- screens are seeded
  // one-per-action-node (Task 2), so the target usually already exists as an
  // empty frame; if it doesn't, the button is disabled rather than inventing
  // a create path here (out of scope for this task).
  const buildNextSteps = selection ? stepsForScreen(selection.targetScreenId) : [];

  const handleGenerate = () => {
    if (!trimmedInstruction) return;
    if (selection) {
      const steps = stepsForScreen(selection.targetScreenId);
      void generation.start({
        screenId: selection.targetScreenId,
        instruction: trimmedInstruction,
        layout: sketchLayout ?? undefined,
        steps: steps.length > 0 ? steps : undefined,
      });
      return;
    }
    void generation.start({ instruction: trimmedInstruction });
  };

  const handleRegenerate = (screen: RoomDesignScreen) => {
    if (!trimmedInstruction) return;
    const layout =
      selection?.targetScreenId === screen.id ? sketchLayout ?? undefined : undefined;
    const steps = stepsForScreen(screen.id);
    void generation.start({
      screenId: screen.id,
      instruction: trimmedInstruction,
      layout,
      steps: steps.length > 0 ? steps : undefined,
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
      {buildNextSteps.length > 0 ? (
        <VStack gap={1} width="100%" data-testid="build-next-steps">
          <Text type="supporting" color="secondary">Build next step</Text>
          <HStack gap={2} vAlign="center">
            {buildNextSteps.map((step) => {
              const targetScreen = canvasScreens.find(
                (candidate) => candidate.flowNodeId === step.nodeId,
              );
              return (
                <Button
                  key={step.nodeId}
                  label={`Build ${step.label} →`}
                  variant="secondary"
                  size="sm"
                  isLoading={isGenerating}
                  isDisabled={isGenerating || trimmedInstruction.length === 0 || !targetScreen}
                  onClick={() => {
                    if (!trimmedInstruction || !targetScreen) return;
                    const onwardSteps = stepsForFlowNode(step.nodeId);
                    void generation.start({
                      screenId: targetScreen.id,
                      instruction: trimmedInstruction,
                      steps: onwardSteps.length > 0 ? onwardSteps : undefined,
                    });
                  }}
                />
              );
            })}
          </HStack>
        </VStack>
      ) : null}
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
