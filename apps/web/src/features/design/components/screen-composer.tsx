"use client";

import { Badge } from "@astryxdesign/core/Badge";
import {
  ChatComposer,
  ChatComposerInput,
  ChatSendButton,
  type ChatComposerInputHandle,
} from "@astryxdesign/core/Chat";
import { Icon } from "@astryxdesign/core/Icon";
import { StackItem } from "@astryxdesign/core/Stack";
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
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import { AgentRoutingChip } from "@/features/rooms/components/agent-routing-chip";
import type { AgentRouting } from "@/features/rooms/components/routing-model";
import { PixelArrowUp as ArrowUp } from "@/ui/pixel-icons";
import { AgentsEmptyStart } from "@/features/canvas/agents-empty-start";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";
import type { CanvasSketchSelection } from "@/features/canvas/use-canvas-selection";
import { resolveMimeType } from "@/features/rooms/attachment-mime";
import {
  listDesignAgentTurns,
  type DesignAgentTurn,
} from "../design-agent-transcript";
import { useDesignProfileDistillation } from "../use-design-profile-distillation";
import { useDesignScreenGeneration } from "../use-design-screen-generation";
import { AgentsTranscript } from "./agents-transcript";

// Accepted design-system upload types, mirrored from DesignSystemBanner --
// the empty state's "Add a design system" row opens the same picker directly
// (no banner) so it accepts the same formats.
const DESIGN_SYSTEM_MIME_TYPES: Record<string, boolean> = {
  "text/plain": true,
  "text/markdown": true,
  "text/html": true,
  "application/pdf": true,
};
const DESIGN_SYSTEM_ACCEPT =
  ".md,.txt,.html,.htm,.pdf,text/plain,text/markdown,text/html,application/pdf";

// How often to re-read the transcript while a generation is in flight so the
// agent reply transitions queued -> running -> built without a page reload.
const TRANSCRIPT_POLL_MS = 2_000;

// Same neutral prompt used as both the placeholder and the accessible label
// (PrdSelectionComposer's own convention), so a screen-reader user is asked
// exactly what a sighted one is.
const COMPOSER_PROMPT = "Describe the screen you want to generate";

// ChatComposer is a transparent layout shell -- the only fill on it is what we
// set here on its root: the darker --color-background-body (one step below the
// panel's --color-background-surface) with the composer's own --radius-chat
// corners, so it reads as a rounded darker input. Shadows stripped since it's
// anchored in the panel, not floating.
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

export function ScreenComposer({
  roomId,
  access,
  currentUserId,
  currentUserName,
  selection = null,
  canvasScreens = [],
  designTokenCss = "",
  agentReadiness,
  routing,
  onChoose = () => undefined,
  onPreview,
  banner = null,
  onDesignSystemResolved,
}: {
  roomId: string;
  access: "edit" | "view";
  // Resolves the "who sent it" author on the user's own transcript turns.
  currentUserId: string;
  currentUserName: string;
  // The active design profile's token CSS -- drives the built-screen
  // thumbnails in the transcript, exactly as it drives the canvas frames.
  designTokenCss?: string;
  selection?: CanvasSketchSelection | null;
  // Rendered directly above the composer field (e.g. the design-system upload
  // banner) so it sits on top of the composer and stays pinned with it.
  banner?: ReactNode;
  // The canvas's screen->key/flow-node projection, so Generate can hand the
  // generator the semantic-key context. Defaults to "nothing known" so a
  // caller without one -- or a unit test -- degrades to no context.
  canvasScreens?: CanvasScreen[];
  // Same room-level provider/model routing the Conversation and PRD composers
  // use (useRoomRouting, keyed by roomId) -- one shared picker per room.
  agentReadiness?: AgentReadiness;
  routing?: AgentRouting;
  onChoose?: (provider: Provider, model?: string) => void;
  // Opens a built screen's prototype preview from a transcript reply.
  onPreview?: (screenId: string) => void;
  // Flips the canvas's "has active design profile" state once an upload
  // started from the empty state's "Add a design system" row resolves.
  onDesignSystemResolved?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const inputHandleRef = useRef<ChatComposerInputHandle>(null);
  const designSystemInputRef = useRef<HTMLInputElement>(null);
  const [turns, setTurns] = useState<DesignAgentTurn[]>([]);
  const generation = useDesignScreenGeneration({
    roomId,
    access,
    onScreenReady: () => router.refresh(),
  });
  // Drives the empty state's "Add a design system" row -- opens the same
  // upload/distill pipeline the banner uses, without rendering the banner.
  const distillation = useDesignProfileDistillation({
    roomId,
    onResolved: onDesignSystemResolved,
  });
  const isGenerating =
    generation.status === "queued" || generation.status === "running";

  // Durable transcript: re-read on mount, on every generation status change,
  // and on a short interval while a generation is in flight so the reply's
  // status transitions land live. A whole-list replace drops any optimistic
  // turn once the real (server) one arrives. `refreshTurns` is the imperative
  // path used by submit + the poll interval; the effect below does its own
  // cancellable fetch so it never setStates synchronously.
  const refreshTurns = useCallback(async () => {
    if (access !== "edit") return;
    setTurns(await listDesignAgentTurns(roomId));
  }, [access, roomId]);
  useEffect(() => {
    if (access !== "edit") return;
    let cancelled = false;
    void listDesignAgentTurns(roomId).then((next) => {
      if (!cancelled) setTurns(next);
    });
    return () => {
      cancelled = true;
    };
  }, [access, roomId, generation.status]);
  useEffect(() => {
    if (!isGenerating) return;
    const timer = setInterval(() => void refreshTurns(), TRANSCRIPT_POLL_MS);
    return () => clearInterval(timer);
  }, [isGenerating, refreshTurns]);

  if (access === "view") return null;

  const prefillComposer = (text: string) => {
    setValue(text);
    inputHandleRef.current?.focus();
  };

  const handleDesignSystemFile = (file: File) => {
    const mimeType = resolveMimeType(file.name, file.type);
    if (!DESIGN_SYSTEM_MIME_TYPES[mimeType]) return;
    void file.arrayBuffer().then((buffer) => {
      void distillation.upload({
        fileName: file.name,
        mimeType,
        bytes: new Uint8Array(buffer),
      });
    });
  };

  const trimmedValue = value.trim();
  // A selected screen frame with sketch shapes retargets generation at that
  // frame's screen and hands the serialized layout to the generator.
  const sketchLayout: SketchLayout | null = selection
    ? serializeSketch(selection.sketchShapes, selection.frame)
    : null;

  // Semantic-key generation context: keyed screens already on the canvas, plus
  // any target key an existing screen points at but no screen yet fulfils, plus
  // shared layouts -- so the generator can link/reuse by key. Omitted when
  // there's nothing to report.
  const existingScreens = canvasScreens
    .filter((candidate): candidate is CanvasScreen & { screenKey: string } =>
      Boolean(candidate.screenKey),
    )
    .map((candidate) => ({ key: candidate.screenKey, name: candidate.name }));
  const distinctLayouts = canvasScreens
    .map((candidate) => candidate.layout)
    .filter((layout): layout is NonNullable<CanvasScreen["layout"]> =>
      Boolean(layout),
    )
    .filter(
      (layout, index, all) =>
        all.findIndex((other) => other.id === layout.id) === index,
    );
  const danglingTargets = computeDanglingTargets(
    canvasScreens.map((candidate) => ({
      screenKey: candidate.screenKey,
      actions: candidate.preview?.actions ?? [],
    })),
    distinctLayouts.map((layout) => ({ actions: layout.actions })),
  );
  const existingLayouts = canvasScreens
    .filter(
      (
        candidate,
      ): candidate is CanvasScreen & { layoutKey: string; layoutName: string } =>
        Boolean(candidate.layoutKey) && Boolean(candidate.layoutName),
    )
    .map((candidate) => ({ key: candidate.layoutKey, name: candidate.layoutName }))
    .filter(
      (layout, index, all) =>
        all.findIndex((other) => other.key === layout.key) === index,
    );
  const generationContext =
    existingScreens.length > 0 ||
    danglingTargets.length > 0 ||
    existingLayouts.length > 0
      ? { existingScreens, danglingTargets, existingLayouts }
      : undefined;

  function submit(instructionText: string) {
    const trimmed = instructionText.trim();
    if (!trimmed) return;
    setValue("");

    // Optimistic turn so the user's own words appear instantly; the next
    // refreshTurns replaces it with the real (server) turn.
    const optimistic: DesignAgentTurn = {
      taskId: `optimistic-${Date.now()}`,
      screenId: selection?.targetScreenId ?? "",
      screenName: "Screen",
      userPrompt: trimmed,
      initiatedBy: currentUserId,
      taskStatus: "queued",
      screenState: "empty",
      currentVersionId: null,
      createdAt: new Date().toISOString(),
    };
    setTurns((prev) => [...prev, optimistic]);

    const provider = routing?.provider;
    const model = routing?.model;
    const start = selection
      ? generation.start({
          screenId: selection.targetScreenId,
          instruction: trimmed,
          provider,
          model,
          layout: sketchLayout ?? undefined,
          context: generationContext,
        })
      : generation.start({
          instruction: trimmed,
          provider,
          model,
          context: generationContext,
        });
    void start.then(() => void refreshTurns());
  }

  return (
    <VStack
      height="100%"
      width="100%"
      style={{ minHeight: "var(--spacing-0)" }}
      data-testid="screen-composer"
    >
      {/* Hidden picker for the empty state's "Add a design system" row. */}
      <input
        ref={designSystemInputRef}
        type="file"
        accept={DESIGN_SYSTEM_ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) handleDesignSystemFile(file);
          event.currentTarget.value = "";
        }}
      />
      {/* Scrollable transcript; the composer below stays pinned. Empty until
          the first generation, when the starters show instead. */}
      <StackItem size="fill" isScrollable style={{ width: "100%" }}>
        {turns.length === 0 ? (
          <AgentsEmptyStart
            onPrefill={prefillComposer}
            onAddDesignSystem={() => designSystemInputRef.current?.click()}
          />
        ) : (
          <AgentsTranscript
            turns={turns}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            canvasScreens={canvasScreens}
            tokenCss={designTokenCss}
            onPreview={onPreview}
          />
        )}
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
        {distillation.status === "failed" && distillation.message ? (
          <Text type="supporting" color="secondary">{distillation.message}</Text>
        ) : null}
      </VStack>
    </VStack>
  );
}
