"use client";

import {
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
} from "@astryxdesign/core/Chat";
import { Center } from "@astryxdesign/core/Center";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { createClient } from "@/lib/supabase/client";
import { listDiscoveryMessages, postMessage } from "../actions";
import type {
  DiscoveryMessage,
} from "../repository";
import type { MessageInput } from "../schemas";
import { DiscoveryComposer } from "./composer";
import { useCallback, useEffect, useRef, useState } from "react";

export type RoomSubscription = (
  onMessage: (message: DiscoveryMessage) => void,
) => () => void;

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
  currentUserId,
  currentUserName,
  initialMessages,
  realtimeMode = "production",
  sendMessage = postMessage,
  subscribe,
}: {
  roomId: string;
  currentUserId: string;
  currentUserName: string;
  initialMessages: DiscoveryMessage[];
  realtimeMode?: "production" | "development-poll";
  sendMessage?: (input: MessageInput) => Promise<DiscoveryMessage>;
  subscribe?: RoomSubscription;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
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

  if (messages.length === 0) {
    return (
      <Center
        width="100%"
        height="100%"
        data-testid="empty-room-composer"
      >
        <VStack
          width="100%"
          maxWidth="calc(var(--spacing-12) * 16)"
          padding={6}
          data-testid="empty-room-composer-content"
        >
          {composer}
        </VStack>
      </Center>
    );
  }

  return (
    <ChatLayout
      density="spacious"
      composer={composer}
    >
      <ChatMessageList density="spacious">
        {messages.map((message) => (
          <ChatMessage
            key={message.clientId}
            sender={
              message.authorId === currentUserId ? "user" : "assistant"
            }
          >
            <ChatMessageBubble
              name={message.authorName}
              metadata={
                <Text type="supporting">
                  {message.delivery === "sending"
                    ? "Sending"
                    : message.delivery === "failed"
                      ? "Failed to send"
                      : new Intl.DateTimeFormat("en", {
                          timeStyle: "short",
                        }).format(new Date(message.createdAt))}
                </Text>
              }
            >
              <Text>{message.body}</Text>
            </ChatMessageBubble>
          </ChatMessage>
        ))}
      </ChatMessageList>
    </ChatLayout>
  );
}
