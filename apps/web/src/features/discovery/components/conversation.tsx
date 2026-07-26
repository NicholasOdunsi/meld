"use client";

import {
  ChatLayout,
  ChatMessage,
  ChatMessageList,
} from "@astryxdesign/core/Chat";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Divider } from "@astryxdesign/core/Divider";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import Image from "next/image";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  listDiscoveryMessages,
  postMessage,
  uploadAttachment,
} from "../actions";
import type {
  DiscoveryMessage,
} from "../repository";
import type { MessageInput } from "../schemas";
import { DiscoveryComposer } from "./composer";
import type {
  DiscoveryComposerSubmission,
  DiscoveryMentionOption,
} from "./composer-model";
import {
  AgentMarker,
  DISCOVERY_AGENTS,
  getAgentKind,
} from "./agent-marker";

export type RoomSubscription = (
  onMessage: (message: DiscoveryMessage) => void,
) => () => void;

const NO_PARTICIPANTS: Array<{ userId: string; email: string }> = [];

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
  const agentKind = getAgentKind(
    message.authorId,
    message.authorName,
  );
  if (agentKind) {
    return (
      DISCOVERY_AGENTS.find((agent) => agent.kind === agentKind)
        ?.name ?? message.authorName
    );
  }
  if (message.authorId === currentUserId) return currentUserName;
  return (
    participantNames.get(message.authorId) ??
    (message.authorName === "Room participant"
      ? "Unknown member"
      : message.authorName)
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
        const message = event.new as {
          id: string;
          room_id: string;
          client_id: string;
          author_id: string;
          body: string;
          created_at: string;
        };
        onMessage({
          id: message.id,
          roomId: message.room_id,
          clientId: message.client_id,
          authorId: message.author_id,
          authorName: "Room participant",
          body: message.body,
          createdAt: message.created_at,
          delivery: "persisted",
        });
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
) {
  let active = true;
  const poll = async () => {
    try {
      const messages = await listDiscoveryMessages(roomId);
      if (active) messages.forEach(onMessage);
    } finally {
      if (active) window.setTimeout(poll, 200);
    }
  };
  void poll();
  return () => {
    active = false;
  };
}

export function Conversation({
  roomId,
  roomName,
  currentUserId,
  currentUserName,
  participants = NO_PARTICIPANTS,
  initialMessages,
  realtimeMode = "production",
  sendMessage = postMessage,
  uploadFile = uploadAttachment,
  subscribe,
}: {
  roomId: string;
  roomName: string;
  currentUserId: string;
  currentUserName: string;
  participants?: Array<{ userId: string; email: string }>;
  initialMessages: DiscoveryMessage[];
  realtimeMode?: "production" | "development-poll";
  sendMessage?: (input: MessageInput) => Promise<DiscoveryMessage>;
  uploadFile?: typeof uploadAttachment;
  subscribe?: RoomSubscription;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [value, setValue] = useState("");
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

  useEffect(() => {
    const roomSubscription =
      subscribe ??
      ((onMessage) =>
        realtimeMode === "development-poll"
          ? subscribeToDevelopmentRoom(roomId, onMessage)
          : subscribeToProductionRoom(roomId, onMessage));
    return roomSubscription(reconcile);
  }, [realtimeMode, reconcile, roomId, subscribe]);

  const uploadAttachments = async (
    submission: DiscoveryComposerSubmission,
    persistedMessage: DiscoveryMessage,
  ) => {
    const uploadResults = await Promise.allSettled(
      submission.attachments.map(({ file }) => {
        const formData = new FormData();
        formData.append("roomId", roomId);
        formData.append("messageId", persistedMessage.id);
        formData.append("file", file);
        if (file.type.startsWith("image/")) {
          formData.append("caption", submission.body);
        }
        return uploadFile(formData);
      }),
    );
    const failedFileNames = uploadResults.flatMap(
      (result, index) =>
        result.status === "rejected"
          ? [submission.attachments[index].file.name]
          : [],
    );
    if (failedFileNames.length > 0) {
      setError(
        `We could not upload: ${failedFileNames.join(", ")}.`,
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
      mentionsProductAgent: false,
    };
    reconcile({
      id: `optimistic:${clientId}`,
      roomId,
      clientId,
      authorId: currentUserId,
      authorName: currentUserName,
      body: submission.body,
      createdAt: new Date().toISOString(),
      delivery: "sending",
    });
    setError(undefined);

    let persistedMessage: DiscoveryMessage;
    try {
      persistedMessage = await sendMessage(input);
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

    await uploadAttachments(submission, persistedMessage);
    return true;
  };

  const composer = (
    <DiscoveryComposer
      value={value}
      onChange={setValue}
      onSubmit={submit}
      mentions={mentionOptions}
      status={error}
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
            const agentKind = getAgentKind(
              message.authorId,
              message.authorName,
            );

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
                      <Text type="label">
                        {authorName}
                      </Text>
                      <Text type="supporting">
                        {formatMessageTime(message)}
                      </Text>
                    </HStack>
                    <Markdown density="compact" autolink="gfm">
                      {message.body}
                    </Markdown>
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
