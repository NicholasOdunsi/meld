"use client";

import {
  ChatLayout,
  ChatMessage,
  ChatMessageList,
} from "@astryxdesign/core/Chat";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Provider } from "@meld/contracts";
import { createClient } from "@/lib/supabase/client";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import { AgentTaskState } from "@/features/ai/components/agent-task-state";
import {
  RoomTaskStatusPoller,
  type RoomTaskStatus,
} from "@/features/ai/room-task-status";
import {
  cancelRoomReplyTask,
  discardStagedDiscoveryAttachment,
  getAgentReadiness,
  linkStagedDiscoveryAttachments,
  listDiscoveryMessages,
  listRoomTaskStatuses,
  postMessage,
  stageDiscoveryAttachment,
  type PostMessageResult,
} from "../actions";
import {
  mapDiscoveryMessageRow,
  type DiscoveryMessage,
  type DiscoveryMessageRow,
} from "../repository";
import type { MessageInput } from "../schemas";
import { DiscoveryComposer } from "./composer";
import {
  buildRoomReturnPath,
  parseRoomDraft,
  roomDraftStorageKey,
  serializeRoomDraft,
  type DiscoveryComposerSubmission,
  type DiscoveryMentionOption,
  type QueuedDiscoveryAttachment,
  type RoomDraft,
} from "./composer-model";
import { AgentMarker, DISCOVERY_AGENTS } from "./agent-marker";
import { buildMentionInlinePlugins } from "./mention-highlight";

export type RoomSubscription = (
  onMessage: (message: DiscoveryMessage) => void,
  onRoomDeleted: () => void,
) => () => void;

const NO_PARTICIPANTS: Array<{ userId: string; email: string }> = [];

function readRoomDraft(roomId: string): RoomDraft | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return parseRoomDraft(
      window.sessionStorage.getItem(roomDraftStorageKey(roomId)),
    );
  } catch {
    return null;
  }
}

function writeRoomDraft(roomId: string, draft: RoomDraft): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(
      roomDraftStorageKey(roomId),
      serializeRoomDraft(draft),
    );
  } catch {
    // A storage write that fails (quota, private mode) simply means the draft
    // is not preserved across the setup detour; the room still functions.
  }
}

function clearRoomDraft(roomId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.removeItem(roomDraftStorageKey(roomId));
  } catch {
    // Ignore: a failed clear at worst leaves a stale draft to be overwritten.
  }
}

function formatMessageTime(message: DiscoveryMessage) {
  if (message.delivery === "sending") return "Sending";
  if (message.delivery === "failed") return "Failed to send";
  return new Intl.DateTimeFormat("en", {
    timeStyle: "short",
  }).format(new Date(message.createdAt));
}

function messageDayKey(message: DiscoveryMessage) {
  const date = new Date(message.createdAt);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatMessageDay(message: DiscoveryMessage) {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
  }).format(new Date(message.createdAt));
}

const PRODUCT_AGENT_NAME =
  DISCOVERY_AGENTS.find((agent) => agent.kind === "product")?.name ??
  "Product Agent";

const PROVIDER_LABEL: Record<Provider, string> = {
  codex: "Codex",
  claude: "Claude",
};

// A message renders as the Product Agent purely from its provenance
// (author_type = 'product_agent'), never from a denormalized name, so it stays
// the Product Agent even when another participant initiated the reply.
function messageAgentKind(message: DiscoveryMessage) {
  return message.authorType === "product_agent" ? ("product" as const) : null;
}

function resolveHumanName({
  userId,
  currentUserId,
  currentUserName,
  participantNames,
}: {
  userId: string | null;
  currentUserId: string;
  currentUserName: string;
  participantNames: Map<string, string>;
}) {
  if (!userId) return "Unknown member";
  if (userId === currentUserId) return currentUserName;
  return participantNames.get(userId) ?? "Unknown member";
}

function resolveAuthorName({
  message,
  currentUserId,
  currentUserName,
  participantNames,
}: {
  message: DiscoveryMessage;
  currentUserId: string;
  currentUserName: string;
  participantNames: Map<string, string>;
}) {
  if (message.authorType === "product_agent") {
    return PRODUCT_AGENT_NAME;
  }
  return resolveHumanName({
    userId: message.authorId,
    currentUserId,
    currentUserName,
    participantNames,
  });
}

// The Product Agent reply's shared content: the answer, its assumptions as a
// compact labelled list, its citations as room-local source actions, and its
// suggested questions as composer-fill actions.
function ProductAgentContent({
  message,
  inlinePlugins,
  onCiteMessage,
  onFillQuestion,
}: {
  message: DiscoveryMessage;
  inlinePlugins: ReturnType<typeof buildMentionInlinePlugins>;
  onCiteMessage: (messageId: string) => void;
  onFillQuestion: (question: string) => void;
}) {
  const hasCitations =
    message.citedMessageIds.length > 0 ||
    message.citedEvidenceIds.length > 0;

  return (
    <VStack gap={1} width="100%">
      <Markdown
        density="compact"
        autolink="gfm"
        inlinePlugins={inlinePlugins}
      >
        {message.body}
      </Markdown>

      {message.assumptions.length > 0 ? (
        <List
          density="compact"
          header={<Text type="label">Assumptions</Text>}
          data-testid="agent-assumptions"
        >
          {message.assumptions.map((assumption, index) => (
            <ListItem key={`assumption-${index}`} label={assumption} />
          ))}
        </List>
      ) : null}

      {hasCitations ? (
        <VStack gap={0.5} data-testid="agent-citations">
          <Text type="label">Sources</Text>
          <HStack gap={2} vAlign="center">
            {message.citedMessageIds.map((messageId, index) => (
              <Button
                key={messageId}
                variant="ghost"
                size="sm"
                label={`Source ${index + 1}`}
                onClick={() => onCiteMessage(messageId)}
              />
            ))}
            {message.citedEvidenceIds.map((evidenceId, index) => (
              <Token
                key={evidenceId}
                color="teal"
                size="sm"
                label={`Evidence ${index + 1}`}
              />
            ))}
          </HStack>
        </VStack>
      ) : null}

      {message.suggestedNextQuestions.length > 0 ? (
        <VStack gap={0.5} data-testid="agent-suggested-questions">
          <Text type="label">Suggested next questions</Text>
          <VStack gap={1}>
            {message.suggestedNextQuestions.map((question, index) => (
              <Button
                key={`question-${index}`}
                variant="secondary"
                size="sm"
                label={question}
                onClick={() => onFillQuestion(question)}
              />
            ))}
          </VStack>
        </VStack>
      ) : null}
    </VStack>
  );
}

function reconcileMessage(
  messages: DiscoveryMessage[],
  incoming: DiscoveryMessage,
) {
  const withoutDuplicate = messages.filter(
    (message) =>
      message.clientId !== incoming.clientId &&
      message.id !== incoming.id,
  );
  return [...withoutDuplicate, incoming].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

function subscribeToProductionRoom(
  roomId: string,
  onMessage: (message: DiscoveryMessage) => void,
  onRoomDeleted: () => void,
) {
  const supabase = createClient();
  const channel = supabase
    .channel(`room:${roomId}`, { config: { private: true } })
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `room_id=eq.${roomId}`,
      },
      (event) => {
        // The raw INSERT row is shaped differently from a query row, so it goes
        // through the same shared mapper the initial query uses -- this is what
        // carries the full Product Agent provenance (provider, initiator, and
        // the citation/assumption/suggested-question arrays) over Realtime, and
        // makes the persisted message the authority for the completed reply.
        onMessage(
          mapDiscoveryMessageRow(event.new as DiscoveryMessageRow),
        );
      },
    )
    .on(
      "broadcast",
      { event: "room-deleted" },
      () => {
        onRoomDeleted();
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

function subscribeToDevelopmentRoom(
  roomId: string,
  onMessage: (message: DiscoveryMessage) => void,
  onRoomDeleted: () => void,
) {
  let active = true;
  const poll = async () => {
    try {
      const messages = await listDiscoveryMessages(roomId);
      if (active) messages.forEach(onMessage);
    } catch {
      if (active) onRoomDeleted();
      return;
    }
    if (active) window.setTimeout(poll, 200);
  };
  void poll();
  return () => {
    active = false;
  };
}

export function Conversation({
  roomId,
  roomName,
  organizationId,
  currentUserId,
  currentUserName,
  participants = NO_PARTICIPANTS,
  initialMessages,
  realtimeMode = "production",
  sendMessage = postMessage,
  stageAttachment = stageDiscoveryAttachment,
  linkAttachments = linkStagedDiscoveryAttachments,
  discardAttachment = discardStagedDiscoveryAttachment,
  fetchReadiness = getAgentReadiness,
  fetchTaskStatuses = listRoomTaskStatuses,
  cancelTask = cancelRoomReplyTask,
  subscribe,
}: {
  roomId: string;
  roomName: string;
  organizationId?: string;
  currentUserId: string;
  currentUserName: string;
  participants?: Array<{ userId: string; email: string }>;
  initialMessages: DiscoveryMessage[];
  realtimeMode?: "production" | "development-poll";
  sendMessage?: (input: MessageInput) => Promise<PostMessageResult>;
  stageAttachment?: typeof stageDiscoveryAttachment;
  linkAttachments?: typeof linkStagedDiscoveryAttachments;
  discardAttachment?: typeof discardStagedDiscoveryAttachment;
  fetchReadiness?: () => Promise<AgentReadiness>;
  fetchTaskStatuses?: (roomId: string) => Promise<RoomTaskStatus[]>;
  cancelTask?: (taskId: string) => Promise<unknown>;
  subscribe?: RoomSubscription;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  // Restored synchronously from the room-scoped sessionStorage draft, if any,
  // so a return from AI setup rehydrates the composer body and provider before
  // first paint. Attachment bytes are never stored, so staged files are not
  // rehydrated here; their ids survive in the draft for future re-linking.
  const [restoredDraft] = useState<RoomDraft | null>(() =>
    readRoomDraft(roomId),
  );
  const [value, setValue] = useState(restoredDraft?.body ?? "");
  const [readiness, setReadiness] = useState<AgentReadiness>();
  const [error, setError] = useState<string>();
  const participantNames = new Map(
    participants.map((participant) => [
      participant.userId,
      participant.email,
    ]),
  );
  const mentionOptions = useMemo<DiscoveryMentionOption[]>(
    () => [
      ...participants.map((participant) => ({
        id: `human:${participant.userId}`,
        userId: participant.userId,
        label: participant.email,
        handle: participant.email,
        kind: "human" as const,
        description: "Room teammate",
      })),
      ...DISCOVERY_AGENTS.map((agent) => ({
        id: agent.id,
        label: agent.name,
        handle:
          agent.kind === "product"
            ? "product-agent"
            : "research-agent",
        kind: agent.kind,
        description: "Room agent",
      })),
    ],
    [participants],
  );
  const mentionInlinePlugins = useMemo(
    () => buildMentionInlinePlugins(mentionOptions),
    [mentionOptions],
  );
  const persistedMessagesByClientId = useRef(
    new Map<string, DiscoveryMessage>(
      initialMessages
        .filter((message) => message.delivery === "persisted")
        .map((message) => [message.clientId, message]),
    ),
  );
  const reconcile = useCallback((message: DiscoveryMessage) => {
    if (message.delivery === "persisted") {
      persistedMessagesByClientId.current.set(
        message.clientId,
        message,
      );
    }
    setMessages((current) => reconcileMessage(current, message));
  }, []);

  const handleRoomDeleted = useCallback(() => {
    router.push(organizationId ? `/${organizationId}` : "/");
    router.refresh();
  }, [organizationId, router]);

  // Pending Product Agent task state, keyed by the human source message it
  // answers. Fed only by the safe list_room_ai_task_statuses projection -- never
  // a direct ai_tasks read -- and rebuilt from each poll so a task that vanishes
  // (revoked access, or one this participant may no longer see) drops its
  // pending affordance. The completed reply itself still arrives over Realtime
  // as a persisted message; this only surfaces the interim state.
  const [taskStatuses, setTaskStatuses] = useState<
    Map<string, RoomTaskStatus>
  >(new Map());
  const pollerRef = useRef<RoomTaskStatusPoller | null>(null);

  useEffect(() => {
    const poller = new RoomTaskStatusPoller({
      fetchStatuses: () => fetchTaskStatuses(roomId),
      onStatuses: (statuses) => {
        setTaskStatuses(
          new Map(
            statuses
              .filter((task) => task.sourceMessageId !== null)
              .map((task) => [task.sourceMessageId as string, task]),
          ),
        );
      },
      onError: () => {
        // A failed status read (e.g. revoked access) stops the poll; the room
        // stays usable and the completed reply still arrives over Realtime.
      },
    });
    pollerRef.current = poller;
    poller.start();
    return () => {
      poller.stop();
      pollerRef.current = null;
    };
  }, [fetchTaskStatuses, roomId]);

  useEffect(() => {
    const roomSubscription =
      subscribe ??
      ((onMessage, onRoomDeleted) =>
        realtimeMode === "development-poll"
          ? subscribeToDevelopmentRoom(roomId, onMessage, onRoomDeleted)
          : subscribeToProductionRoom(roomId, onMessage, onRoomDeleted));
    return roomSubscription(reconcile, handleRoomDeleted);
  }, [handleRoomDeleted, realtimeMode, reconcile, roomId, subscribe]);

  const handleStageAttachment = useCallback(
    (attachment: QueuedDiscoveryAttachment) => {
      const formData = new FormData();
      formData.append("roomId", roomId);
      formData.append("file", attachment.file);
      return stageAttachment(formData);
    },
    [roomId, stageAttachment],
  );

  const handleDiscardStagedAttachment = useCallback(
    (attachmentId: string) =>
      discardAttachment({ roomId, attachmentId }),
    [discardAttachment, roomId],
  );

  // Readiness is resolved once from the authenticated session on mount. It is
  // never inferred from client state; a failure leaves it undefined, which the
  // composer treats as "not ready yet" and simply hides the agent controls.
  useEffect(() => {
    let active = true;
    fetchReadiness()
      .then((resolved) => {
        if (active) {
          setReadiness(resolved);
        }
      })
      .catch(() => {
        // A readiness read that fails must not break the room; the composer
        // still posts ordinary messages and gates the agent behind "not ready".
      });
    return () => {
      active = false;
    };
  }, [fetchReadiness]);

  // The restored draft is a one-shot handoff: consume the stored copy on mount
  // so a later fresh visit to the room does not resurrect it.
  useEffect(() => {
    if (restoredDraft) {
      clearRoomDraft(roomId);
    }
  }, [restoredDraft, roomId]);

  // No ready provider: persist the full room-scoped draft and route to AI
  // setup, carrying a validated returnTo back to this exact room. The draft is
  // stored, never the message -- nothing has been posted.
  const handleConnectPersonalAI = useCallback(
    (draft: RoomDraft) => {
      if (!organizationId) {
        return;
      }
      const returnTo = buildRoomReturnPath(organizationId, roomId);
      if (!returnTo) {
        return;
      }
      writeRoomDraft(roomId, draft);
      router.push(
        `/${organizationId}/settings/devices?returnTo=${encodeURIComponent(
          returnTo,
        )}`,
      );
    },
    [organizationId, roomId, router],
  );

  const linkAttachmentsToMessage = async (
    submission: DiscoveryComposerSubmission,
    persistedMessage: DiscoveryMessage,
  ) => {
    if (submission.attachments.length === 0) {
      return;
    }
    try {
      await linkAttachments({
        roomId,
        messageId: persistedMessage.id,
        attachmentIds: submission.attachments.map(
          ({ uploaded }) => uploaded.id,
        ),
        caption: submission.body,
      });
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "We could not attach every uploaded file.",
      );
    }
  };

  const submit = async (
    submission: DiscoveryComposerSubmission,
  ): Promise<boolean> => {
    const clientId = crypto.randomUUID();
    const input: MessageInput = {
      roomId,
      clientId,
      body: submission.body,
      mentionedUserIds: submission.mentionedUserIds,
      mentionsProductAgent: submission.mentionsProductAgent,
      providerOverride: submission.providerOverride,
    };
    reconcile({
      id: `optimistic:${clientId}`,
      roomId,
      clientId,
      authorType: "human",
      authorId: currentUserId,
      initiatedBy: null,
      aiTaskId: null,
      provider: null,
      body: submission.body,
      citedMessageIds: [],
      citedEvidenceIds: [],
      assumptions: [],
      suggestedNextQuestions: [],
      createdAt: new Date().toISOString(),
      delivery: "sending",
    });
    setError(undefined);

    let persistedMessage: DiscoveryMessage;
    // Best-effort task outcome; the human message is authoritative regardless.
    let agentTask: PostMessageResult["agentTask"] = {
      status: "not_requested",
    };
    try {
      const result = await sendMessage(input);
      persistedMessage = result.message;
      agentTask = result.agentTask;
      reconcile(persistedMessage);
    } catch (reason: unknown) {
      const realtimeMessage =
        persistedMessagesByClientId.current.get(clientId);
      if (!realtimeMessage) {
        setMessages((current) =>
          current.map((message) =>
            message.clientId === clientId &&
            message.delivery === "sending"
              ? { ...message, delivery: "failed" }
              : message,
          ),
        );
        setError(
          reason instanceof Error
            ? reason.message
            : "We could not post the message.",
        );
        return false;
      }
      persistedMessage = realtimeMessage;
    }

    await linkAttachmentsToMessage(submission, persistedMessage);

    // The human message persisted. A readiness race -- the provider vanishing
    // between the preflight and the send -- surfaces here as a retryable agent
    // error over the still-posted message, never as a rollback.
    if (agentTask.status === "retryable_error") {
      setError(agentTask.message);
    }

    // A mention just queued a reply: poll the safe status projection now so the
    // pending state appears without waiting out the interval.
    if (agentTask.status === "queued") {
      pollerRef.current?.notifyQueued();
    }

    // Clear the room-scoped draft only now, after human persistence.
    clearRoomDraft(roomId);
    return true;
  };

  // Every non-cancel recovery (bring the device back online, re-authenticate,
  // switch or re-authorize a provider, re-ask after a failure) is resolved from
  // the authenticated AI setup, so those actions route there with a validated
  // returnTo back to this room. Cancel is the one action that mutates the task
  // directly, through the authenticated cancel RPC with its own ownership check.
  const handleAgentSetupRecovery = useCallback(() => {
    if (!organizationId) {
      return;
    }
    const returnTo = buildRoomReturnPath(organizationId, roomId);
    if (!returnTo) {
      return;
    }
    router.push(
      `/${organizationId}/settings/devices?returnTo=${encodeURIComponent(
        returnTo,
      )}`,
    );
  }, [organizationId, roomId, router]);

  const handleCancelTask = useCallback(
    async (taskId: string) => {
      try {
        await cancelTask(taskId);
        pollerRef.current?.notifyQueued();
      } catch {
        setError("We could not cancel the Product Agent task.");
      }
    },
    [cancelTask],
  );

  const messageClientIdById = useMemo(
    () => new Map(messages.map((message) => [message.id, message.clientId])),
    [messages],
  );

  // A citation is a room-local action: scroll the cited message into view when
  // it is present in the room. A cited message outside this participant's view
  // simply has no scroll target and the action is a no-op.
  const scrollToCitedMessage = useCallback(
    (messageId: string) => {
      const clientId = messageClientIdById.get(messageId);
      if (!clientId) {
        return;
      }
      const element = document.querySelector(
        `[data-testid="conversation-message-${clientId}"]`,
      );
      if (
        element &&
        typeof (element as HTMLElement).scrollIntoView === "function"
      ) {
        (element as HTMLElement).scrollIntoView({ block: "center" });
      }
    },
    [messageClientIdById],
  );

  const fillComposerWithQuestion = useCallback((question: string) => {
    setValue(question);
  }, []);

  const composer = (
    <DiscoveryComposer
      value={value}
      onChange={setValue}
      onSubmit={submit}
      onStageAttachment={handleStageAttachment}
      onDiscardStagedAttachment={handleDiscardStagedAttachment}
      mentions={mentionOptions}
      status={error}
      agentReadiness={readiness}
      onConnectPersonalAI={handleConnectPersonalAI}
      initialProviderOverride={restoredDraft?.providerOverride}
    />
  );

  return (
    <ChatLayout
      density="balanced"
      composer={composer}
      style={{ height: "100%" }}
      emptyState={
        <VStack
          gap={2}
          hAlign="center"
          data-testid="empty-room-welcome"
        >
          <Image
            src="/mascots/meld-spark.png"
            alt=""
            aria-hidden="true"
            width={512}
            height={512}
            data-testid="discovery-room-mascot"
            style={{
              blockSize: "auto",
              inlineSize: "calc(var(--spacing-12) * 2)",
            }}
          />
          <Heading level={3} accessibilityLevel={2}>
            Start exploring {roomName} together
          </Heading>
          <Text
            type="body"
            color="secondary"
            display="block"
            justify="center"
            textWrap="balance"
            style={{
              maxWidth: "calc(var(--spacing-12) * 10)",
            }}
          >
            Share observations, evidence, and questions with your team.
            Mention a connected agent to synthesize insights and
            suggest next steps.
          </Text>
        </VStack>
      }
    >
      {messages.length > 0 ? (
        <ChatMessageList density="compact" gap={3}>
          {messages.map((message, index) => {
            const previousMessage = messages[index - 1];
            const startsNewDay =
              !previousMessage ||
              messageDayKey(previousMessage) !==
                messageDayKey(message);
            const authorName = resolveAuthorName({
              message,
              currentUserId,
              currentUserName,
              participantNames,
            });
            const agentKind = messageAgentKind(message);
            const providerLabel = message.provider
              ? PROVIDER_LABEL[message.provider]
              : null;
            const initiatorName =
              agentKind && message.initiatedBy
                ? resolveHumanName({
                    userId: message.initiatedBy,
                    currentUserId,
                    currentUserName,
                    participantNames,
                  })
                : null;
            const pendingTask =
              message.authorType === "human"
                ? taskStatuses.get(message.id)
                : undefined;

            return (
              <Fragment key={message.clientId}>
                {startsNewDay ? (
                  <Divider
                    label={
                      <Text type="supporting">
                        {formatMessageDay(message)}
                      </Text>
                    }
                  />
                ) : null}
                <ChatMessage
                  sender="assistant"
                  avatar={
                    agentKind ? (
                      <AgentMarker
                        kind={agentKind}
                        name={authorName}
                        size="md"
                      />
                    ) : (
                      <Avatar name={authorName} size="md" />
                    )
                  }
                  data-testid={`conversation-message-${message.clientId}`}
                >
                  <VStack gap={0.5} width="100%">
                    <HStack gap={2} vAlign="center">
                      <Text type="label">{authorName}</Text>
                      {agentKind && providerLabel ? (
                        <Text type="supporting" color="secondary">
                          via {providerLabel}
                        </Text>
                      ) : null}
                      {initiatorName ? (
                        <Text type="supporting" color="secondary">
                          Asked by {initiatorName}
                        </Text>
                      ) : null}
                      <Text type="supporting">
                        {formatMessageTime(message)}
                      </Text>
                    </HStack>
                    {agentKind ? (
                      <ProductAgentContent
                        message={message}
                        inlinePlugins={mentionInlinePlugins}
                        onCiteMessage={scrollToCitedMessage}
                        onFillQuestion={fillComposerWithQuestion}
                      />
                    ) : (
                      <Markdown
                        density="compact"
                        autolink="gfm"
                        inlinePlugins={mentionInlinePlugins}
                      >
                        {message.body}
                      </Markdown>
                    )}
                    {pendingTask ? (
                      <AgentTaskState
                        status={pendingTask.status}
                        provider={pendingTask.provider}
                        onCancel={() =>
                          void handleCancelTask(pendingTask.taskId)
                        }
                        onRetry={handleAgentSetupRecovery}
                        onReconnect={handleAgentSetupRecovery}
                        onAuthenticate={handleAgentSetupRecovery}
                        onSwitchProvider={handleAgentSetupRecovery}
                      />
                    ) : null}
                  </VStack>
                </ChatMessage>
              </Fragment>
            );
          })}
        </ChatMessageList>
      ) : null}
    </ChatLayout>
  );
}
