"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import {
  ChatComposer,
  ChatComposerInput,
  ChatSendButton,
  type ChatComposerInputHandle,
} from "@astryxdesign/core/Chat";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StackItem } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  computeDanglingTargets,
  serializeSketch,
  type SketchLayout,
} from "@meld/prototype";
import type { Provider } from "@meld/contracts";
import { useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import { AgentRoutingChip } from "@/features/rooms/components/agent-routing-chip";
import type { AgentRouting } from "@/features/rooms/components/routing-model";
import { PixelArrowUp as ArrowUp } from "@/ui/pixel-icons";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";
import type { CanvasSketchSelection } from "@/features/canvas/use-canvas-selection";
import {
  listDesignScreenVersions,
  restoreDesignScreenVersion,
  type DesignScreenVersion,
  type RoomDesignScreen,
} from "../design-screen-generation";
import { useDesignScreenGeneration } from "../use-design-screen-generation";

// Same neutral prompt used as both the placeholder and the accessible label
// (PrdSelectionComposer's own convention), so a screen-reader user is asked
// exactly what a sighted one is.
const COMPOSER_PROMPT = "Describe the screen you want to generate";

// ChatComposer is a transparent layout shell -- verified: not one element in
// its rendered subtree paints a background of its own, so the only fill on
// the composer is whatever we set here on its root. We paint it directly
// (no wrapper div, no border): the darker --color-background-body, one step
// below the panel's --color-background-surface, with the composer's own
// --radius-chat corners so it's a rounded darker input rather than a flat
// block. Shadows stripped since it's anchored in the panel, not floating.
const composerChromeStyle = {
  "--shadow-low": "none",
  "--shadow-med": "none",
  "--shadow-high": "none",
  boxShadow: "none",
  backgroundColor: "var(--color-background-body)",
  borderRadius: "var(--radius-chat)",
} as CSSProperties;

const composerInputStyle = {
  minBlockSize: "calc(var(--spacing-8) + var(--spacing-4))",
  maxBlockSize: "calc(var(--spacing-8) * 4)",
  overflowY: "auto",
} as CSSProperties;

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
  agentReadiness,
  routing,
  onChoose = () => undefined,
  banner = null,
}: {
  roomId: string;
  access: "edit" | "view";
  screens: RoomDesignScreen[];
  selection?: CanvasSketchSelection | null;
  // Rendered directly above the composer field (e.g. the design-system
  // upload banner) so it sits on top of the composer rather than at the top
  // of the whole panel, and stays pinned with the composer rather than
  // scrolling away with the screens list.
  banner?: ReactNode;
  // The canvas's screen->key/flow-node projection, so Generate/Regenerate can
  // hand the generator the semantic-key context (existing screens + dangling
  // targets). Defaults to "nothing known" so a caller that doesn't yet have
  // one -- or a unit test -- degrades to no context rather than throwing.
  canvasScreens?: CanvasScreen[];
  // Same room-level provider/model routing the Conversation and PRD
  // composers use (useRoomRouting, keyed by roomId) -- threaded down from
  // the Canvas so all three surfaces share one picker and one persisted
  // preference per room, not a separate one per surface.
  agentReadiness?: AgentReadiness;
  routing?: AgentRouting;
  onChoose?: (provider: Provider, model?: string) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const inputHandleRef = useRef<ChatComposerInputHandle>(null);
  const [restoring, setRestoring] = useState<{ screenId: string; versionId: string } | null>(null);
  const generation = useDesignScreenGeneration({
    roomId,
    access,
    onScreenReady: () => router.refresh(),
  });
  const isGenerating = generation.status === "queued" || generation.status === "running";

  if (access === "view") return null;

  const trimmedValue = value.trim();
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
  // Every shared layout at least one canvas screen already resolves to,
  // distinct by layout id, so its own nav actions (e.g. sidebar links) count
  // toward danglingTargets below alongside screens' own button actions -- a
  // layout's forward reference to an unbuilt screen key should surface for
  // the model to fulfil exactly like a screen button's does (Task 3).
  const distinctLayouts = canvasScreens
    .map((candidate) => candidate.layout)
    .filter((layout): layout is NonNullable<CanvasScreen["layout"]> => Boolean(layout))
    .filter(
      (layout, index, all) => all.findIndex((other) => other.id === layout.id) === index,
    );
  const danglingTargets = computeDanglingTargets(
    canvasScreens.map((candidate) => ({
      screenKey: candidate.screenKey,
      actions: candidate.preview?.actions ?? [],
    })),
    distinctLayouts.map((layout) => ({ actions: layout.actions })),
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

  function submit(instructionText: string) {
    const trimmed = instructionText.trim();
    if (!trimmed) return;
    setValue("");
    const provider = routing?.provider;
    const model = routing?.model;
    if (selection) {
      void generation.start({
        screenId: selection.targetScreenId,
        instruction: trimmed,
        provider,
        model,
        layout: sketchLayout ?? undefined,
        context: generationContext,
      });
      return;
    }
    void generation.start({ instruction: trimmed, provider, model, context: generationContext });
  }

  const handleRegenerate = (screen: RoomDesignScreen) => {
    if (!trimmedValue) return;
    const layout =
      selection?.targetScreenId === screen.id ? sketchLayout ?? undefined : undefined;
    setValue("");
    void generation.start({
      screenId: screen.id,
      instruction: trimmedValue,
      provider: routing?.provider,
      model: routing?.model,
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
    <VStack
      height="100%"
      width="100%"
      style={{ minHeight: "var(--spacing-0)" }}
      data-testid="screen-composer"
    >
      {/* Scrollable: only the built-screens list scrolls, so the composer
          below stays pinned in view the way a chat surface's composer does,
          instead of scrolling out of reach with a long screens list. */}
      <StackItem size="fill" isScrollable style={{ width: "100%" }}>
        {screens.length > 0 ? (
          <VStack gap={2} padding={2} width="100%">
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
                          isDisabled={isGenerating || trimmedValue.length === 0}
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
      </StackItem>
      <VStack gap={2} width="100%" style={{ padding: "var(--spacing-2)" }}>
        {banner}
        {selection && selection.sketchShapes.length > 0 ? (
          <Badge
            variant="info"
            icon="▦"
            label={`sketch: ${selection.sketchShapes.length} shapes`}
          />
        ) : null}
        <ChatComposer
          density="compact"
          value={value}
          onChange={setValue}
          onSubmit={submit}
          isDisabled={isGenerating}
          style={composerChromeStyle}
          placeholder={COMPOSER_PROMPT}
          sendButton={
            <ChatSendButton
              isDisabled={isGenerating || trimmedValue.length === 0}
              onSend={() => submit(value)}
              sendIcon={<Icon icon={ArrowUp} size="xsm" />}
            />
          }
          sendActions={
            <AgentRoutingChip
              readiness={agentReadiness}
              routing={routing}
              isAgentAddressed
              onChoose={onChoose}
              onConnect={() => undefined}
            />
          }
          input={
            <ChatComposerInput
              handleRef={inputHandleRef}
              value={value}
              onChange={setValue}
              onSubmit={submit}
              isDisabled={isGenerating}
              label={COMPOSER_PROMPT}
              placeholder={COMPOSER_PROMPT}
              maxRows={4}
              pasteAsToken={false}
              style={composerInputStyle}
            />
          }
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
      </VStack>
    </VStack>
  );
}
