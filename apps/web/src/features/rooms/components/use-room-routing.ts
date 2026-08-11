"use client";

import type { Provider } from "@meld/contracts";
import { useCallback, useEffect, useState } from "react";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import { readRoomRouting, writeRoomRouting } from "./room-routing-store";
import {
  resolveEffectiveRouting,
  type AgentRouting,
} from "./routing-model";

// Keep the room override personal and local. Hydrate in an effect so server
// markup is stable and localStorage never becomes a render-time dependency.
export function useRoomRouting({
  roomId,
  readiness,
  initialProviderOverride,
  initialModelOverride,
}: {
  roomId: string;
  readiness: AgentReadiness | undefined;
  initialProviderOverride?: Provider;
  initialModelOverride?: string;
}): {
  routing: AgentRouting | undefined;
  choose: (provider: Provider, model?: string) => void;
} {
  const [override, setOverride] = useState<AgentRouting | undefined>(
    initialProviderOverride
      ? { provider: initialProviderOverride, model: initialModelOverride }
      : undefined,
  );

  useEffect(() => {
    if (initialProviderOverride) {
      const next = {
        provider: initialProviderOverride,
        model: initialModelOverride,
      } satisfies AgentRouting;
      writeRoomRouting(roomId, next);
      const timeoutId = window.setTimeout(() => setOverride(next), 0);
      return () => window.clearTimeout(timeoutId);
    }
    const timeoutId = window.setTimeout(
      () => setOverride(readRoomRouting(roomId)),
      0,
    );
    return () => window.clearTimeout(timeoutId);
  }, [initialModelOverride, initialProviderOverride, roomId]);

  const choose = useCallback(
    (provider: Provider, model?: string) => {
      const next = { provider, model } satisfies AgentRouting;
      setOverride(next);
      writeRoomRouting(roomId, next);
    },
    [roomId],
  );

  return {
    routing: resolveEffectiveRouting(readiness, override),
    choose,
  };
}
