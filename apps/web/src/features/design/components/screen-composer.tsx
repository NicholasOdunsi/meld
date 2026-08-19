"use client";

import {
  ChatComposer,
  ChatComposerInput,
  ChatSendButton,
  type ChatComposerInputHandle,
} from "@astryxdesign/core/Chat";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { computeDanglingTargets, serializeSketch } from "@meld/prototype";
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
import type { CanvasScreenSelection } from "@/features/canvas/use-canvas-selection";
import { resolveMimeType } from "@/features/rooms/attachment-mime";
import {
  listDesignAgentTurns,
  type DesignAgentTurn,
} from "../design-agent-transcript";
import { useDesignProfileDistillation } from "../use-design-profile-distillation";
import {
  useDesignScreenGeneration,
  type StartInput,
} from "../use-design-screen-generation";
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

// Chip/dismiss key for a "create a new screen from this sketch" entry, which
// has no screen id of its own (targetScreenId: null).
const NEW_SCREEN_KEY = "__new_screen__";

function targetLabel(
  t: CanvasScreenSelection,
  screenNameById: Map<string, string>,
): string {
  return t.targetScreenId === null
    ? "New screen"
    : screenNameById.get(t.targetScreenId) ?? "Screen";
}

// Builds the per-screen optimistic turns + generation.startMany() inputs for
// a multi-screen submit. Kept as a plain top-level function -- rather than a
// closure inside ScreenComposer -- because it both loops over the targeted
// screens and calls Date.now()/`new Date()` per screen, and
// eslint-plugin-react-hooks' purity check treats any function nested in a
// component that does both as a render-purity risk, even one (like this)
// that's only ever invoked from an event handler and never touches JSX.
function buildFanOutSubmission(
  targets: CanvasScreenSelection[],
  trimmed: string,
  currentUserId: string,
  screenNameById: Map<string, string>,
  provider: Provider | undefined,
  model: string | undefined,
  generationContext: StartInput["context"],
): { optimisticTurns: DesignAgentTurn[]; startManyInputs: StartInput[] } {
  const now = Date.now();
  const optimisticTurns: DesignAgentTurn[] = [];
  const startManyInputs: StartInput[] = [];
  targets.forEach((t, i) => {
    optimisticTurns.push({
      taskId: `optimistic-${now}-${i}`,
      screenId: t.targetScreenId ?? "",
      screenName: targetLabel(t, screenNameById),
      userPrompt: trimmed,
      initiatedBy: currentUserId,
      taskStatus: "queued",
      screenState: "empty",
      currentVersionId: null,
      createdAt: new Date().toISOString(),
    });
    startManyInputs.push({
      // null target => omit screenId so generateDesignScreen creates a new
      // screen, using the sketch bounding box as the layout frame.
      screenId: t.targetScreenId ?? undefined,
      instruction: trimmed,
      provider,
      model,
      layout: t.sketchShapes.length
        ? serializeSketch(t.sketchShapes, t.frame)
        : undefined,
      context: generationContext,
    });
  });
  return { optimisticTurns, startManyInputs };
}

export function ScreenComposer({
  roomId,
  access,
  currentUserId,
  currentUserName,
  selection = [],
  canvasScreens = [],
  designTokenCss = "",
  designComponentCss = "",
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
  // The active design profile's component CSS -- same role as designTokenCss.
  designComponentCss?: string;
  // One entry per screen the user has targeted on the canvas (a selected
  // frame, or a loose sketch shape whose center sits inside a frame). Each
  // entry carries the sketch shapes contained in that screen's frame.
  selection?: CanvasScreenSelection[];
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
  const isGenerating = generation.isGenerating;
  // Screens dismissed from this turn's chip row via the remove control --
  // reset whenever the selection itself changes (a fresh canvas selection
  // should show every targeted screen again, even one just dismissed).
  // Adjusted during render rather than in an effect (React's documented
  // "adjusting state when a prop changes" pattern): comparing against the
  // last-seen selection key and resetting synchronously avoids an extra
  // commit-then-effect round trip.
  const [dismissedScreenIds, setDismissedScreenIds] = useState<Set<string>>(
    new Set(),
  );
  const selectionKey = selection
    .map((s) => s.targetScreenId ?? NEW_SCREEN_KEY)
    .join(",");
  const [prevSelectionKey, setPrevSelectionKey] = useState(selectionKey);
  if (selectionKey !== prevSelectionKey) {
    setPrevSelectionKey(selectionKey);
    setDismissedScreenIds(new Set());
  }
  const screenNameById = new Map(canvasScreens.map((s) => [s.id, s.name]));
  const effectiveTargets = selection.filter(
    (s) => !dismissedScreenIds.has(s.targetScreenId ?? NEW_SCREEN_KEY),
  );
  // `generation.isGenerating` only covers the window from the server action
  // being queued to it resolving -- it can't see the roundtrip between a
  // click and that queue call landing. `isSubmitting` closes that gap: set
  // synchronously at the top of submit, cleared once start/startMany
  // resolves, so a fast double-click can't fire a second generation.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const busy = isGenerating || isSubmitting;

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
    // `busy` guards submit itself, not just the UI controls that call it --
    // ChatComposer/ChatSendButton/ChatComposerInput are all disabled while
    // busy, but this keeps a stray Enter-key or double-click from re-running
    // submit even if one of those controls' own disabled handling has a gap.
    if (!trimmed || busy) return;
    // Set synchronously, before any await/promise chain -- this is what
    // closes the double-submit window between the click and
    // generation.start/startMany's queue call actually resolving (see
    // `busy` above; generation.isGenerating alone can't see this gap).
    setIsSubmitting(true);
    setValue("");

    const provider = routing?.provider;
    const model = routing?.model;

    if (effectiveTargets.length === 0) {
      // Optimistic turn so the user's own words appear instantly; the next
      // refreshTurns replaces it with the real (server) turn.
      const optimistic: DesignAgentTurn = {
        // `submit` only runs from a click/Enter event, never during render, so
        // Date.now() here is safe.
        taskId: `optimistic-${Date.now()}`,
        screenId: "",
        screenName: "Screen",
        userPrompt: trimmed,
        initiatedBy: currentUserId,
        taskStatus: "queued",
        screenState: "empty",
        currentVersionId: null,
        createdAt: new Date().toISOString(),
      };
      setTurns((prev) => [...prev, optimistic]);
      void generation
        .start({ instruction: trimmed, provider, model, context: generationContext })
        .then(() => void refreshTurns())
        .finally(() => setIsSubmitting(false));
      return;
    }

    // One optimistic turn + one generation per targeted screen, each with
    // its own frame's serialized sketch layout.
    const { optimisticTurns, startManyInputs } = buildFanOutSubmission(
      effectiveTargets,
      trimmed,
      currentUserId,
      screenNameById,
      provider,
      model,
      generationContext,
    );
    setTurns((prev) => [...prev, ...optimisticTurns]);

    void generation
      .startMany(startManyInputs)
      .then(() => void refreshTurns())
      .finally(() => setIsSubmitting(false));
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
            componentCss={designComponentCss}
            onPreview={onPreview}
          />
        )}
      </StackItem>
      <VStack gap={2} width="100%" style={{ padding: "var(--spacing-2)" }}>
        {banner}
        <ChatComposer
          density="compact"
          value={value}
          onChange={setValue}
          onSubmit={submit}
          isDisabled={busy}
          style={composerChromeStyle}
          placeholder={COMPOSER_PROMPT}
          sendButton={
            <ChatSendButton
              isDisabled={busy || trimmedValue.length === 0}
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
            // Chips live in the input slot, directly above the textarea, so the
            // gap between them and the field is this VStack's own (small) gap --
            // not the composer body's larger inter-slot spacing.
            <VStack gap={1} width="100%" style={{ minInlineSize: "var(--spacing-0)" }}>
              {effectiveTargets.length > 0 ? (
                <HStack gap={0.5} wrap="wrap">
                  {effectiveTargets.map((t) => {
                    const key = t.targetScreenId ?? NEW_SCREEN_KEY;
                    return (
                      <Token
                        key={key}
                        label={targetLabel(t, screenNameById)}
                        size="sm"
                        endContent={
                          t.sketchShapes.length ? (
                            <Text type="supporting">{`· following your sketch (${t.sketchShapes.length})`}</Text>
                          ) : undefined
                        }
                        onRemove={() =>
                          setDismissedScreenIds((prev) => new Set(prev).add(key))
                        }
                      />
                    );
                  })}
                </HStack>
              ) : null}
              <ChatComposerInput
                handleRef={inputHandleRef}
                value={value}
                onChange={setValue}
                onSubmit={submit}
                isDisabled={busy}
                label={COMPOSER_PROMPT}
                placeholder={COMPOSER_PROMPT}
                maxRows={4}
                pasteAsToken={false}
                style={composerInputStyle}
              />
            </VStack>
          }
        />
        {distillation.status === "failed" && distillation.message ? (
          <Text type="supporting" color="secondary">{distillation.message}</Text>
        ) : null}
      </VStack>
    </VStack>
  );
}
