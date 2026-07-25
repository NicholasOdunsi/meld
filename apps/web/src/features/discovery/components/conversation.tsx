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
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import Image from "next/image";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { listDiscoveryMessages, postMessage } from "../actions";
import type {
  DiscoveryMessage,
} from "../repository";
import type { MessageInput } from "../schemas";
import { DiscoveryComposer } from "./composer";
import {
  AgentMarker,
  DISCOVERY_AGENTS,
  getAgentKind,
} from "./agent-marker";

export type RoomSubscription = (
  onMessage: (message: DiscoveryMessage) => void,
) => () => void;

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
  participants = [],
  initialMessages,
  realtimeMode = "production",
  sendMessage = postMessage,
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
  const persistedClientIds = useRef(
    new Set(
      initialMessages
        .filter((message) => message.delivery === "persisted")
        .map((message) => message.clientId),
    ),
  );
  const reconcile = useCallback((message: DiscoveryMessage) => {
    if (message.delivery === "persisted") {
      persistedClientIds.current.add(message.clientId);
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

  const submit = (body: string) => {
    const normalizedBody = body.trim();
    if (!normalizedBody) return;
    const clientId = crypto.randomUUID();
    const input: MessageInput = {
      roomId,
      clientId,
      body: normalizedBody,
      mentionedUserIds: [],
      mentionsProductAgent: false,
    };
    reconcile({
      id: `optimistic:${clientId}`,
      roomId,
      clientId,
      authorId: currentUserId,
      authorName: currentUserName,
      body: normalizedBody,
      createdAt: new Date().toISOString(),
      delivery: "sending",
    });
    setValue("");
    setError(undefined);
    void sendMessage(input)
      .then(reconcile)
      .catch((reason: unknown) => {
        if (persistedClientIds.current.has(clientId)) return;
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
      });
  };

  const composer = (
    <DiscoveryComposer
      value={value}
      onChange={setValue}
      onSubmit={submit}
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
            type="supporting"
            color="secondary"
            display="block"
            justify="center"
            textWrap="balance"
            style={{
              maxWidth: "calc(var(--spacing-12) * 10)",
            }}
          >
            Share observations, customer evidence, and questions with
            your team. Mention a connected agent to synthesize the
            discussion and suggest next steps.
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
                    <Text>{message.body}</Text>
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
