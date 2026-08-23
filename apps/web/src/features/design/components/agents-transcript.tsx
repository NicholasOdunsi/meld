"use client";

import { Avatar } from "@astryxdesign/core/Avatar";
import { Button } from "@astryxdesign/core/Button";
import { ChatMessage, ChatMessageList } from "@astryxdesign/core/Chat";
import { HStack } from "@astryxdesign/core/HStack";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import type { AITaskStatus } from "@meld/contracts";
import { DISCOVERY_AGENTS } from "@/features/rooms/components/agent-marker";
import { frameSizeForFormFactor } from "@meld/prototype";
import { Fragment, useMemo } from "react";
import { buildFramePreviewDoc } from "@/features/canvas/screen-preview-doc";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";
import { useScreenThumbnail } from "@/features/design/use-screen-thumbnail";
import transcriptStyles from "./agents-transcript.module.css";
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
// Named once, from the same registry the composer's mention picker reads, so
// the chip and the mention people actually type cannot drift apart.
const DESIGN_AGENT_LABEL =
  DISCOVERY_AGENTS.find((agent) => agent.kind === "design")?.name ??
  "Design Agent";

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
// Names the run in one sentence. A reply that repeated "Here's the X screen"
// once per screen read as several separate answers to one request, and buried
// the screens themselves under prose.
function summarise(names: string[]): string {
  if (names.length === 0) return "Here’s your screen — take a look:";
  if (names.length === 1) return `Here’s the ${names[0]} screen — take a look:`;
  if (names.length === 2) return `I created 2 screens — ${names[0]} and ${names[1]}:`;
  return `I created ${names.length} screens — ${names
    .slice(0, -1)
    .join(", ")} and ${names[names.length - 1]}:`;
}

// Every screen a run produced, as a grid of thumbnails. Each falls back to a
// named View button on its own (no preview doc, capture failed), so one
// unrenderable screen never blanks the others.
function BuiltReply({
  screens,
  screenById,
  tokenCss,
  componentCss,
  onPreview,
}: {
  screens: readonly { id: string; name: string }[];
  screenById?: Map<string, CanvasScreen>;
  tokenCss: string;
  componentCss: string;
  onPreview?: (screenId: string) => void;
}) {
  const named = screens
    .map((entry) => entry.name)
    .filter((name) => Boolean(name) && name !== "Screen");

  return (
    <VStack gap={1} width="100%">
      <Text type="body" data-testid="agents-turn-summary">
        {summarise(named)}
      </Text>
      <div
        data-testid="agents-turn-screens"
        className={transcriptStyles.screenRail}
        // A horizontal rail rather than a wrapping grid: a run can return a
        // dozen screens, and a grid turns the reply into a wall that pushes
        // the rest of the conversation off screen. One row keeps the reply the
        // same height whether it built one screen or ten.
        role="group"
        aria-label="Screens from this generation"
        style={{
          display: "flex",
          gap: "var(--spacing-2)",
          width: "100%",
          overflowX: "auto",
          // Each thumbnail settles under the scroll rather than stopping
          // half-cut, so it always reads as a discrete screen.
          scrollSnapType: "x mandatory",
          // Firefox/legacy-Edge hide via these; WebKit needs a pseudo-element,
          // which only a stylesheet can reach -- see the module.
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {screens.map((entry) => {
          const canvasScreen = screenById?.get(entry.id);
          const open = onPreview ? () => onPreview(entry.id) : undefined;
          if (!open) return null;
          const item = (
            <div
              key={entry.id}
              style={{ flex: "0 0 auto", scrollSnapAlign: "start" }}
            >
              {canvasScreen ? (
                <ScreenThumbnail
              key={entry.id}
                  screen={canvasScreen}
                  tokenCss={tokenCss}
                  componentCss={componentCss}
                  onOpen={open}
                />
              ) : (
                <ViewScreenButton screenName={entry.name} onOpen={open} />
              )}
            </div>
          );
          return item;
        })}
      </div>
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
          screenById={screenById}
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
  screenById,
  tokenCss = "",
  componentCss = "",
  onPreview,
  onCancel,
}: {
  turn: DesignAgentTurn;
  currentUserId: string;
  currentUserName: string;
  /**
   * Canvas rows for the screens this turn produced, keyed by id. A map rather
   * than a single screen: a run builds a batch, and passing only the
   * originating screen left every sibling with a bare View button instead of
   * a thumbnail.
   */
  screenById?: Map<string, CanvasScreen>;
  tokenCss?: string;
  componentCss?: string;
  onPreview?: (screenId: string) => void;
  /** Stops a run that is still going. Omitted where cancelling is not offered. */
  onCancel?: (taskId: string) => void;
}) {
  const askerName =
    turn.initiatedBy === currentUserId ? currentUserName || "You" : "Teammate";
  const isActive = ACTIVE_STATUSES.has(turn.taskStatus);
  const isFailed = FAILED_STATUSES.has(turn.taskStatus);
  const isBuilt =
    turn.screenState === "built" && turn.currentVersionId !== null;
  // A turn describes every screen its run produced. Falling back to the
  // originating screen keeps this working for a turn that arrives without the
  // batch -- an older row, or a caller that builds a turn by hand -- rather
  // than rendering an empty reply or throwing on undefined.
  const batchScreens = turn.screens?.length
    ? turn.screens
    : [
        {
          id: turn.screenId,
          name: turn.screenName,
          state: turn.screenState,
          currentVersionId: turn.currentVersionId,
        },
      ];

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
            {/* The mention is stripped before the instruction is sent, so the
                stored prompt is bare words. Showing it back means the request
                reads like a @Product Agent message does -- addressed to
                someone -- rather than as if it went nowhere in particular. */}
            <Text type="body">
              <Text as="span" type="label" color="accent">
                {`@${DESIGN_AGENT_LABEL}`}
              </Text>{" "}
              {turn.userPrompt}
            </Text>
            {/* What the request was aimed at. Only for a run that edited
                screens which already existed: a screen built from scratch was
                never selected, and naming it back as an attachment would claim
                a choice nobody made. */}
            {turn.editedExisting && batchScreens.length > 0 ? (
              <HStack
                gap={0.5}
                wrap="wrap"
                data-testid="agents-turn-attached-screens"
              >
                {batchScreens.map((entry) => (
                  <Token key={entry.id} size="sm" label={entry.name} />
                ))}
              </HStack>
            ) : null}
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
            <VStack gap={1} width="100%">
              <WaveText
                text="Designing your screen…"
                type="body"
                color="secondary"
              />
              {/* A run takes minutes and there was no way out of one started
                  by mistake -- you waited it out, then deleted the result. */}
              {onCancel ? (
                <HStack>
                  <Button
                    label="Stop generating"
                    size="sm"
                    variant="secondary"
                    onClick={() => onCancel(turn.taskId)}
                  >
                    Stop
                  </Button>
                </HStack>
              ) : null}
            </VStack>
          ) : isFailed ? (
            <Text type="body" color="secondary">
              That didn’t come through — try again.
            </Text>
          ) : isBuilt ? (
            // One reply per screen the run produced. A generation returns a
            // batch, and showing only the originating screen left the rest
            // built-but-unmentioned -- they existed on the canvas with nothing
            // here to say so.
            <BuiltReply
              screens={batchScreens}
              screenById={screenById}
              tokenCss={tokenCss}
              componentCss={componentCss}
              onPreview={onPreview}
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
