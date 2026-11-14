import type { RoomMessage } from "./repository";

// Upsert by id or clientId. A Realtime INSERT echo carries no attachments --
// files link to the message over a separate write that lands after the
// insert -- so keep the attachments already resolved locally rather than
// letting the echo blank them.
export function reconcileMessage(
  messages: RoomMessage[],
  incoming: RoomMessage,
): RoomMessage[] {
  const existing = messages.find(
    (message) =>
      message.clientId === incoming.clientId || message.id === incoming.id,
  );
  const resolved =
    incoming.attachments.length === 0 &&
    existing &&
    existing.attachments.length > 0
      ? { ...incoming, attachments: existing.attachments }
      : incoming;
  const withoutDuplicate = messages.filter(
    (message) =>
      message.clientId !== incoming.clientId && message.id !== incoming.id,
  );
  return [...withoutDuplicate, resolved].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}
