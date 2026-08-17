"use client";

import { Avatar } from "@astryxdesign/core/Avatar";
import { Button } from "@astryxdesign/core/Button";
import { ChatMessage, ChatMessageList } from "@astryxdesign/core/Chat";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { AITaskStatus } from "@meld/contracts";
import { frameSizeForFormFactor } from "@meld/prototype";
import { Fragment, useMemo } from "react";
import { buildFramePreviewDoc } from "@/features/canvas/screen-preview-doc";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";
import { MeldBot } from "@/ui/meld-bot";
import { WaveText } from "@/ui/wave-text";
import type { DesignAgentTurn } from "../design-agent-transcript";

// A scaled, sandboxed live preview of a built screen -- the same preview doc
// the canvas frame renders, shrunk into a clickable thumbnail. Returns null
// when the screen has no safe preview (the caller then falls back to a plain
// View button).
const THUMBNAIL_WIDTH = 220;
const THUMBNAIL_MAX_HEIGHT = 200;
function ScreenThumbnail({
  screen,
  tokenCss,
  onOpen,
}: {
  screen: CanvasScreen;
  tokenCss: string;
  onOpen: () => void;
}) {
  const doc = useMemo(() => {
    try {
      return buildFramePreviewDoc(screen, tokenCss);
    } catch {
      return null;
    }
  }, [screen, tokenCss]);
  if (!doc) return null;

  const size = frameSizeForFormFactor(screen.formFactor);
  const scale = THUMBNAIL_WIDTH / size.w;
  const height = Math.min(size.h * scale, THUMBNAIL_MAX_HEIGHT);

  return (
    <button
      type="button"
      aria-label={`Open ${screen.name}`}
      onClick={onOpen}
      data-testid={`agents-thumbnail-${screen.id}`}
      style={{
        all: "unset",
        display: "block",
        width: `${THUMBNAIL_WIDTH}px`,
        height: `${height}px`,
        overflow: "hidden",
        borderRadius: "var(--radius-element)",
        border: "var(--border-width) solid var(--color-border)",
        cursor: "pointer",
        // A light card fill so a still-loading or blank iframe reads as a
        // clean screen card rather than a broken dark hole. Generated screens
        // render light by default; forcing the light color scheme keeps the
        // preview's own form controls from picking up the app's dark theme.
        backgroundColor: "#ffffff",
        colorScheme: "light",
      }}
    >
      <iframe
        title={`${screen.name} preview`}
        sandbox=""
        srcDoc={doc}
        loading="lazy"
        style={{
          display: "block",
          width: `${size.w}px`,
          height: `${size.h}px`,
          border: "none",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents: "none",
          backgroundColor: "#ffffff",
        }}
      />
    </button>
  );
}

// Same short time format the conversation uses for message timestamps.
const TIME_FORMAT = new Intl.DateTimeFormat("en", { timeStyle: "short" });
function formatTurnTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : TIME_FORMAT.format(date);
}

const ACTIVE_STATUSES: ReadonlySet<AITaskStatus> = new Set<AITaskStatus>([
  "queued",
  "waiting_for_device",
  "ready_to_run",
  "running",
]);
const FAILED_STATUSES: ReadonlySet<AITaskStatus> = new Set<AITaskStatus>([
  "failed",
  "cancelled",
  "needs_reauthentication",
  "usage_limit_reached",
  "needs_review",
]);

// The design agent's purple mascot, sized to sit in a ChatMessage avatar slot
// the same way AgentMarker does for product/research agents in the room.
function DesignAgentAvatar() {
  return (
    <span
      style={{
        display: "inline-flex",
        width: "var(--spacing-9)",
        height: "var(--spacing-9)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <MeldBot variant="design" appearance="head" width={28} height={28} />
    </span>
  );
}

// The agent's completed reply: a short natural line plus a live thumbnail of
// the built screen (falling back to a plain View button when the canvas has
// no safe preview for it yet).
function BuiltReply({
  screen,
  screenName,
  tokenCss,
  onPreview,
}: {
  screen?: CanvasScreen;
  screenName: string;
  tokenCss: string;
  onPreview?: () => void;
}) {
  const hasName = Boolean(screenName) && screenName !== "Screen";
  const line = hasName
    ? `Here’s the ${screenName} screen — take a look:`
    : "Here’s your screen — take a look:";
  return (
    <VStack gap={1} width="100%">
      <Text type="body">{line}</Text>
      {screen && onPreview ? (
        <ScreenThumbnail screen={screen} tokenCss={tokenCss} onOpen={onPreview} />
      ) : onPreview ? (
        <HStack>
          <Button
            label={`View ${screenName}`}
            size="sm"
            variant="secondary"
            onClick={onPreview}
          >
            View
          </Button>
        </HStack>
      ) : null}
    </VStack>
  );
}

export function AgentsTranscript({
  turns,
  currentUserId,
  currentUserName,
  canvasScreens = [],
  tokenCss = "",
  onPreview,
}: {
  turns: readonly DesignAgentTurn[];
  currentUserId: string;
  currentUserName: string;
  // The canvas projection (name + preview markup) used to render a live
  // thumbnail of a built screen in its reply.
  canvasScreens?: readonly CanvasScreen[];
  tokenCss?: string;
  onPreview?: (screenId: string) => void;
}) {
  const screenById = new Map(canvasScreens.map((screen) => [screen.id, screen]));

  return (
    <ChatMessageList
      density="compact"
      gap={3}
      aria-label="Design agent conversation"
      data-testid="agents-transcript"
    >
      {turns.map((turn) => (
        <DesignTurnBubbles
          key={turn.taskId}
          turn={turn}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          screen={screenById.get(turn.screenId)}
          tokenCss={tokenCss}
          onPreview={onPreview}
        />
      ))}
    </ChatMessageList>
  );
}

// The two ChatMessage bubbles for a single design turn -- the user's prompt
// and the agent's reply. Extracted so the room Conversation can render design
// turns inline in its own ChatMessageList, blended with room messages, the
// same way the Agents panel renders them.
export function DesignTurnBubbles({
  turn,
  currentUserId,
  currentUserName,
  screen,
  tokenCss = "",
  onPreview,
}: {
  turn: DesignAgentTurn;
  currentUserId: string;
  currentUserName: string;
  screen?: CanvasScreen;
  tokenCss?: string;
  onPreview?: (screenId: string) => void;
}) {
  const askerName =
    turn.initiatedBy === currentUserId ? currentUserName || "You" : "Teammate";
  const isActive = ACTIVE_STATUSES.has(turn.taskStatus);
  const isFailed = FAILED_STATUSES.has(turn.taskStatus);
  const isBuilt =
    turn.screenState === "built" && turn.currentVersionId !== null;

  return (
    <Fragment>
      {turn.userPrompt ? (
        <ChatMessage
          sender="assistant"
          avatar={<Avatar name={askerName} size="md" />}
          data-testid={`agents-turn-prompt-${turn.taskId}`}
        >
          <VStack gap={0.5} width="100%">
            <HStack gap={2} vAlign="center">
              <Text type="label">{askerName}</Text>
              <Text type="supporting">{formatTurnTime(turn.createdAt)}</Text>
            </HStack>
            <Text type="body">{turn.userPrompt}</Text>
          </VStack>
        </ChatMessage>
      ) : null}

      <ChatMessage
        sender="assistant"
        avatar={<DesignAgentAvatar />}
        data-testid={`agents-turn-reply-${turn.taskId}`}
      >
        <VStack gap={0.5} width="100%">
          <HStack gap={2} vAlign="center">
            <Text type="label">Design Agent</Text>
            {!isActive ? (
              <Text type="supporting">{formatTurnTime(turn.createdAt)}</Text>
            ) : null}
          </HStack>
          {isActive ? (
            <WaveText
              text="Designing your screen…"
              type="body"
              color="secondary"
            />
          ) : isFailed ? (
            <Text type="body" color="secondary">
              That didn’t come through — try again.
            </Text>
          ) : isBuilt ? (
            <BuiltReply
              screen={screen}
              screenName={turn.screenName}
              tokenCss={tokenCss}
              onPreview={onPreview ? () => onPreview(turn.screenId) : undefined}
            />
          ) : (
            <WaveText
              text="Designing your screen…"
              type="body"
              color="secondary"
            />
          )}
        </VStack>
      </ChatMessage>
    </Fragment>
  );
}
