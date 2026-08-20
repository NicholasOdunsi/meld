"use client";

import { Avatar } from "@astryxdesign/core/Avatar";
import { Button } from "@astryxdesign/core/Button";
import { ChatMessage, ChatMessageList } from "@astryxdesign/core/Chat";
import { HStack } from "@astryxdesign/core/HStack";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { AITaskStatus } from "@meld/contracts";
import { frameSizeForFormFactor } from "@meld/prototype";
import { Fragment, useMemo } from "react";
import { buildFramePreviewDoc } from "@/features/canvas/screen-preview-doc";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";
import { useScreenThumbnail } from "@/features/design/use-screen-thumbnail";
import { MeldAgent } from "@/ui/meld-agent";
import { WaveText } from "@/ui/wave-text";
import type { DesignAgentTurn } from "../design-agent-transcript";

// The plain "View <screen>" affordance used whenever there's no thumbnail to
// show -- no screen/onPreview at all, no safe preview doc for the screen, or
// a thumbnail capture that failed. One implementation shared by BuiltReply's
// no-screen branch and ScreenThumbnail's own degraded states.
function ViewScreenButton({
  screenName,
  onOpen,
}: {
  screenName: string;
  onOpen: () => void;
}) {
  return (
    <HStack>
      <Button label={`View ${screenName}`} size="sm" variant="secondary" onClick={onOpen}>
        View
      </Button>
    </HStack>
  );
}

// A thumbnail of a built screen, captured client-side (via useScreenThumbnail)
// from the same preview doc the canvas frame renders. Shows a skeleton while
// the capture is pending and degrades to a plain View button when there's no
// safe preview doc for the screen or the capture itself fails -- never a
// blank/white card.
const THUMBNAIL_WIDTH = 220;
const THUMBNAIL_MAX_HEIGHT = 200;
function ScreenThumbnail({
  screen,
  tokenCss,
  componentCss,
  onOpen,
}: {
  screen: CanvasScreen;
  tokenCss: string;
  componentCss: string;
  onOpen: () => void;
}) {
  const doc = useMemo(() => {
    try {
      return buildFramePreviewDoc(screen, tokenCss, componentCss);
    } catch {
      return null;
    }
  }, [screen, tokenCss, componentCss]);

  const size = frameSizeForFormFactor(screen.formFactor);
  const height = Math.min(size.h * (THUMBNAIL_WIDTH / size.w), THUMBNAIL_MAX_HEIGHT);

  const { state, containerRef } = useScreenThumbnail(doc, {
    width: size.w,
    height: size.h,
  });

  if (doc === null || state.status === "error") {
    return <ViewScreenButton screenName={screen.name} onOpen={onOpen} />;
  }

  return (
    <button
      type="button"
      ref={containerRef}
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
      }}
    >
      {state.status === "ready" ? (
        // A client-captured PNG data URL, not a next/image-optimizable
        // remote asset -- next/image can't do anything useful with a data:
        // URI it doesn't already have decoded dimensions for.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={state.src}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "top",
            display: "block",
          }}
        />
      ) : (
        <Skeleton width="100%" height="100%" radius={2} />
      )}
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
    <HStack
      hAlign="center"
      vAlign="center"
      style={{ width: "var(--spacing-9)", height: "var(--spacing-9)" }}
    >
      <MeldAgent variant="design" appearance="head" width={28} height={28} />
    </HStack>
  );
}

// The agent's completed reply: a short natural line plus a live thumbnail of
// the built screen (falling back to a plain View button when the canvas has
// no safe preview for it yet).
function BuiltReply({
  screen,
  screenName,
  tokenCss,
  componentCss,
  onPreview,
}: {
  screen?: CanvasScreen;
  screenName: string;
  tokenCss: string;
  componentCss: string;
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
        <ScreenThumbnail
          screen={screen}
          tokenCss={tokenCss}
          componentCss={componentCss}
          onOpen={onPreview}
        />
      ) : onPreview ? (
        <ViewScreenButton screenName={screenName} onOpen={onPreview} />
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
  componentCss = "",
  onPreview,
}: {
  turns: readonly DesignAgentTurn[];
  currentUserId: string;
  currentUserName: string;
  // The canvas projection (name + preview markup) used to render a live
  // thumbnail of a built screen in its reply.
  canvasScreens?: readonly CanvasScreen[];
  tokenCss?: string;
  componentCss?: string;
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
          componentCss={componentCss}
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
  componentCss = "",
  onPreview,
}: {
  turn: DesignAgentTurn;
  currentUserId: string;
  currentUserName: string;
  screen?: CanvasScreen;
  tokenCss?: string;
  componentCss?: string;
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
              componentCss={componentCss}
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
