"use client";

import type { Provider } from "@meld/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

// The single terminal command a user runs to pair this Mac. Extracted here
// with the fetch/countdown state so both the settings ConnectDevice screen and
// the onboarding AIConnectionSetup step reuse one implementation instead of
// duplicating the request race handling and expiry math.
// The bootstrap command shown on the pairing screen. Defaults to the
// plan-mandated local bootstrap; a local setup with multiple checkouts can
// override it (e.g. to an absolute path to the built CLI) via
// NEXT_PUBLIC_MELD_PAIR_COMMAND without editing source.
export const PAIRING_COMMAND =
  process.env.NEXT_PUBLIC_MELD_PAIR_COMMAND ??
  "pnpm --filter @meld/connector cli -- pair --join";
const FAKE_CODE_LIFETIME_MS = 5 * 60 * 1000;
export const GENERIC_PAIRING_ERROR =
  "We could not create a pairing code. Please try again.";
const PAIRING_CODE_QUOTA =
  "Use the pairing code already on screen before generating another one.";

export type PairingCode = {
  code: string;
  createdAt: string;
  expiresAt: string;
  provider: Provider;
};

class PairingCodeRequestError extends Error {}

export function providerLabel(provider: Provider) {
  return provider === "codex" ? "Codex" : "Claude";
}

function parsePairingCode(value: unknown, provider: Provider): PairingCode {
  if (
    typeof value !== "object" ||
    value === null ||
    !("code" in value) ||
    typeof value.code !== "string" ||
    value.code.length === 0 ||
    !("expiresAt" in value) ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(new Date(value.expiresAt).getTime()) ||
    !("createdAt" in value) ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(new Date(value.createdAt).getTime())
  ) {
    throw new PairingCodeRequestError(GENERIC_PAIRING_ERROR);
  }

  return {
    code: value.code,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    provider,
  };
}

async function pairingCodeError(response: Response) {
  if (response.status !== 400) {
    return GENERIC_PAIRING_ERROR;
  }

  try {
    const body = (await response.json()) as unknown;
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      body.error === PAIRING_CODE_QUOTA
    ) {
      return body.error;
    }
  } catch {
    // The generic copy below is safe for malformed error responses.
  }

  return GENERIC_PAIRING_ERROR;
}

export type UsePairingCode = {
  selectedProvider: Provider | null;
  pairingCode: PairingCode | null;
  isLoading: boolean;
  error: string | null;
  remainingSeconds: number;
  isExpired: boolean;
  generatePairingCode: (provider: Provider) => Promise<void>;
  reset: () => void;
};

export function usePairingCode(fakePairingCode?: string): UsePairingCode {
  const [selectedProvider, setSelectedProvider] =
    useState<Provider | null>(null);
  const [pairingCode, setPairingCode] = useState<PairingCode | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequest = useRef(0);

  useEffect(() => {
    if (!pairingCode) {
      return;
    }

    const expiration = new Date(pairingCode.expiresAt).getTime();
    const timer = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (currentTime >= expiration) {
        window.clearInterval(timer);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pairingCode]);

  async function generatePairingCode(provider: Provider) {
    const request = latestRequest.current + 1;
    latestRequest.current = request;
    setSelectedProvider(provider);
    setIsLoading(true);
    setError(null);

    try {
      if (fakePairingCode) {
        if (request !== latestRequest.current) {
          return;
        }
        setPairingCode({
          code: fakePairingCode,
          createdAt: new Date(now).toISOString(),
          expiresAt: new Date(now + FAKE_CODE_LIFETIME_MS).toISOString(),
          provider,
        });
        return;
      }

      const response = await fetch("/api/devices/pairing-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedProvider: provider }),
      });

      if (!response.ok) {
        throw new PairingCodeRequestError(await pairingCodeError(response));
      }

      const nextPairingCode = parsePairingCode(
        await response.json(),
        provider,
      );
      if (request !== latestRequest.current) {
        return;
      }
      setPairingCode(nextPairingCode);
    } catch (caught) {
      if (request !== latestRequest.current) {
        return;
      }
      setError(
        caught instanceof PairingCodeRequestError
          ? caught.message
          : GENERIC_PAIRING_ERROR,
      );
    } finally {
      if (request === latestRequest.current) {
        setIsLoading(false);
      }
    }
  }

  const expiresAt = pairingCode
    ? new Date(pairingCode.expiresAt).getTime()
    : null;
  const isExpired = expiresAt !== null && expiresAt <= now;
  const remainingSeconds =
    expiresAt === null
      ? 0
      : Math.max(0, Math.ceil((expiresAt - now) / 1000));

  // Clears the current selection so the caller can return to provider choice.
  const reset = useCallback(() => {
    setSelectedProvider(null);
    setPairingCode(null);
    setError(null);
  }, []);

  return {
    selectedProvider,
    pairingCode,
    isLoading,
    error,
    remainingSeconds,
    isExpired,
    generatePairingCode,
    reset,
  };
}
