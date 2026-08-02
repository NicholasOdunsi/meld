"use client";

import type { Provider } from "@meld/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ProviderSetupView,
  parseProviderSetupView,
} from "../provider-setup-service";
import { isTerminalSetupStatus } from "./provider-setup-progress";

const POLL_INTERVAL_MS = 2000;

export const CREATE_SETUP_ERROR =
  "We could not start setup on this Mac. Please try again.";

export type UseProviderSetup = {
  setup: ProviderSetupView | null;
  setSetup: (next: ProviderSetupView) => void;
  creatingProvider: Provider | null;
  createError: string | null;
  createSetup: (deviceId: string, provider: Provider) => Promise<void>;
  mountedRef: React.MutableRefObject<boolean>;
};

// Encapsulates the durable "start a provider setup on a device, then poll its
// server-owned status" behavior shared by the onboarding AIConnectionSetup and
// the settings ConnectDevice screens. Creating a setup here reuses the paired
// device via create_provider_setup_request, so adding a second provider never
// re-pairs the Mac (which the single-Mac redeem RPC treats as a device
// replacement). The UI only ever stores the durable view the server returns;
// it never fabricates an in-progress stage locally.
export function useProviderSetup(
  initialSetup: ProviderSetupView | null = null,
): UseProviderSetup {
  const [setup, setSetupState] = useState<ProviderSetupView | null>(
    initialSetup,
  );
  const [creatingProvider, setCreatingProvider] = useState<Provider | null>(
    null,
  );
  const [createError, setCreateError] = useState<string | null>(null);

  // A late-resolving fetch must not setState on an unmounted component; every
  // async write below is gated on this, and the poll fetches are aborted too.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setSetup = useCallback((next: ProviderSetupView) => {
    if (mountedRef.current) {
      setSetupState(next);
    }
  }, []);

  const createSetup = useCallback(
    async (deviceId: string, provider: Provider) => {
      setCreatingProvider(provider);
      setCreateError(null);
      try {
        const response = await fetch("/api/devices/provider-setups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId, provider }),
        });
        if (!response.ok) {
          throw new Error("create failed");
        }
        const next = parseProviderSetupView(await response.json());
        if (!mountedRef.current) {
          return;
        }
        // Only the durable view the server returned is stored — the UI never
        // fabricates an in-progress stage locally.
        setSetupState(next);
      } catch {
        if (mountedRef.current) {
          setCreateError(CREATE_SETUP_ERROR);
        }
      } finally {
        if (mountedRef.current) {
          setCreatingProvider(null);
        }
      }
    },
    [],
  );

  const requestId = setup?.id ?? null;
  const status = setup?.status ?? null;

  const poll = useCallback(async (id: string, signal: AbortSignal) => {
    try {
      const response = await fetch(`/api/devices/provider-setups/${id}`, {
        signal,
      });
      if (!response.ok) {
        return;
      }
      const next = parseProviderSetupView(await response.json());
      if (!signal.aborted && mountedRef.current) {
        setSetupState(next);
      }
    } catch {
      // A dropped or aborted poll simply retries on the next tick; the last
      // durable snapshot stays on screen.
    }
  }, []);

  // Per-request progress poll: runs once a request id is known and stops on
  // terminal status, on unmount (interval cleared, in-flight fetch aborted).
  useEffect(() => {
    if (requestId === null || status === null || isTerminalSetupStatus(status)) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void poll(requestId, controller.signal);
    }, POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [poll, requestId, status]);

  return {
    setup,
    setSetup,
    creatingProvider,
    createError,
    createSetup,
    mountedRef,
  };
}
