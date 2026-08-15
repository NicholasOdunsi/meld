"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  getDesignProfileDistillation,
  uploadDesignSystemDocument,
} from "./design-profile-distillation";

type Status = "idle" | "uploading" | "distilling" | "resolved" | "failed";
const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 300;

// Derived from uploadDesignSystemDocument's own parameter type rather than
// hand-typed, so `bytes` stays whatever Uint8Array specialization the
// underlying zod schema infers (TS 5.7+ typed arrays are generic, and a bare
// `Uint8Array` annotation here would be structurally incompatible with it).
type UploadFile = Omit<Parameters<typeof uploadDesignSystemDocument>[0], "roomId">;

// A plain (non-hook) recursive helper rather than a self-referencing
// useCallback: react-hooks/immutability flags a useCallback that calls
// itself, because that closure's own identity can go stale across renders.
// use-design-screen-generation.ts sidesteps the same trap by keeping its
// poll loop inside a useEffect instead of a useCallback; this hook has no
// need for an effect (upload always starts its own poll chain), so the loop
// lives as a module-level function instead.
async function pollDistillation({
  taskId,
  attempt,
  disposedRef,
  onResolved,
  setStatus,
  setMessage,
}: {
  taskId: string;
  attempt: number;
  disposedRef: RefObject<boolean>;
  onResolved?: () => void | Promise<void>;
  setStatus: (status: Status) => void;
  setMessage: (message: string | null) => void;
}): Promise<void> {
  if (disposedRef.current) return;
  const generation = await getDesignProfileDistillation(taskId);
  if (disposedRef.current) return;
  if (generation?.versionId) {
    setStatus("resolved");
    await onResolved?.();
    return;
  }
  if (attempt + 1 >= MAX_POLL_ATTEMPTS) {
    setMessage("Distillation did not finish in time. Try again.");
    setStatus("failed");
    return;
  }
  setTimeout(() => {
    void pollDistillation({
      taskId,
      attempt: attempt + 1,
      disposedRef,
      onResolved,
      setStatus,
      setMessage,
    });
  }, POLL_INTERVAL_MS);
}

export function useDesignProfileDistillation({
  roomId,
  onResolved,
}: {
  roomId: string;
  onResolved?: () => void | Promise<void>;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const disposedRef = useRef(false);

  const upload = useCallback(
    async (file: UploadFile) => {
      setMessage(null);
      setStatus("uploading");
      const result = await uploadDesignSystemDocument({ roomId, ...file });
      if (result.status === "error") {
        setMessage(result.message);
        setStatus("failed");
        return;
      }
      setStatus("distilling");
      setTimeout(() => {
        void pollDistillation({
          taskId: result.taskId,
          attempt: 0,
          disposedRef,
          onResolved,
          setStatus,
          setMessage,
        });
      }, POLL_INTERVAL_MS);
    },
    [roomId, onResolved],
  );

  useEffect(() => {
    return () => {
      disposedRef.current = true;
    };
  }, []);

  return { status, message, upload };
}
