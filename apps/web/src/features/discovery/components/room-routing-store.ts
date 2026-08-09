import { ModelNameSchema, ProviderSchema } from "@meld/contracts";
import type { AgentRouting } from "./routing-model";

// The room-sticky routing override, persisted to localStorage rather than the
// sessionStorage the draft uses (composer-model.ts:507): sessionStorage dies
// with the tab, and this choice is meant to hold until the user changes it
// back. It is personal and per-room, so it stays on the client; a DB row is the
// upgrade path if it should ever follow a user across devices.
export function roomRoutingStorageKey(roomId: string): string {
  return `discovery-routing:${roomId}`;
}

// Untrusted storage input never becomes a dispatched provider: only a value the
// contract's own enum accepts survives. Anything else is discarded, which the
// caller treats as "no override" and therefore falls back to the saved default.
export function parseRoomRouting(
  raw: string | null,
): AgentRouting | undefined {
  if (!raw) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }

  const provider = ProviderSchema.safeParse(
    (parsed as Record<string, unknown>).provider,
  );
  if (!provider.success) return undefined;
  const model = ModelNameSchema.safeParse(
    (parsed as Record<string, unknown>).model,
  );
  return {
    provider: provider.data,
    ...(model.success ? { model: model.data } : {}),
  };
}

export function serializeRoomRouting(routing: AgentRouting): string {
  return JSON.stringify({
    provider: routing.provider,
    ...(routing.model ? { model: routing.model } : {}),
  });
}

export function readRoomRouting(roomId: string): AgentRouting | undefined {
  try {
    return parseRoomRouting(
      window.localStorage.getItem(roomRoutingStorageKey(roomId)),
    );
  } catch {
    // Private mode and disabled-storage browsers throw on access. The composer
    // stays fully usable on the saved default.
    return undefined;
  }
}

export function writeRoomRouting(
  roomId: string,
  routing: AgentRouting,
): void {
  try {
    window.localStorage.setItem(
      roomRoutingStorageKey(roomId),
      serializeRoomRouting(routing),
    );
  } catch {
    // Persistence is a convenience, never a dependency: a failed write leaves
    // the in-memory choice working for this session.
  }
}
