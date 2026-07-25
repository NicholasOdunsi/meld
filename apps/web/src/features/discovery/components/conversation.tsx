"use client";

import {
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
} from "@astryxdesign/core/Chat";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Text } from "@astryxdesign/core/Text";
import { createClient } from "@/lib/supabase/client";
import { listDiscoveryMessages, postMessage } from "../actions";
import type {
  DiscoveryMessage,
} from "../repository";
import type { MessageInput } from "../schemas";
import { DiscoveryComposer } from "./composer";
import { useCallback, useEffect, useState } from "react";

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
  const reconcile = useCallback((message: DiscoveryMessage) => {
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
        setMessages((current) =>
          current.map((message) =>
            message.clientId === clientId
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

  return (
    <ChatLayout
      density="balanced"
      composer={
        <DiscoveryComposer
          value={value}
          onChange={setValue}
          onSubmit={submit}
          status={error}
        />
      }
      emptyState={
        <EmptyState
          title="Start the discovery conversation"
          description="Share research, evidence, and decisions with room participants."
        />
      }
    >
      <ChatMessageList
        emptyState={
          <EmptyState
            title="Start the discovery conversation"
            description="Share research, evidence, and decisions with room participants."
          />
        }
      >
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
