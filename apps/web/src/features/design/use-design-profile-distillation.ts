"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { isTerminalTaskStatus, type RoomTaskStatus } from "@/features/ai/room-task-status";
import { useRoomTaskStatus } from "@/features/prd/components/room-task-status-provider";
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
  roomStatusesRef,
  onResolved,
  setStatus,
  setMessage,
}: {
  taskId: string;
  attempt: number;
  disposedRef: RefObject<boolean>;
  roomStatusesRef: RefObject<RoomTaskStatus[]>;
  onResolved?: () => void | Promise<void>;
  setStatus: (status: Status) => void;
  setMessage: (message: string | null) => void;
}): Promise<void> {
  if (disposedRef.current) return;
  // get_design_profile_distillation returns versionId: null identically
  // whether the task is still running or has actually failed -- polling
  // alone cannot tell those apart. The room's task-status projection can:
  // if the queued task has already reached a terminal, non-completed status
  // (failed/cancelled/needs_reauthentication/...), report failure now
  // instead of waiting out MAX_POLL_ATTEMPTS. Mirrors
  // use-design-screen-generation.ts's poll loop.
  const task = roomStatusesRef.current.find((candidate) => candidate.taskId === taskId);
  if (task && isTerminalTaskStatus(task.status) && task.status !== "completed") {
    setMessage("Distillation did not complete. Try again.");
    setStatus("failed");
    return;
  }
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
      roomStatusesRef,
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
  const roomTaskStatus = useRoomTaskStatus();
  const notifyRoomTaskQueued = roomTaskStatus?.notifyQueued;
  const roomStatusesRef = useRef<RoomTaskStatus[]>(roomTaskStatus?.statuses ?? []);
  useEffect(() => {
    roomStatusesRef.current = roomTaskStatus?.statuses ?? [];
  }, [roomTaskStatus?.statuses]);

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
      notifyRoomTaskQueued?.({ kind: "design_profile_distill", taskId: result.taskId });
      setTimeout(() => {
        void pollDistillation({
          taskId: result.taskId,
          attempt: 0,
          disposedRef,
          roomStatusesRef,
          onResolved,
          setStatus,
          setMessage,
        });
      }, POLL_INTERVAL_MS);
    },
    [roomId, onResolved, notifyRoomTaskQueued],
  );

  // useRef survives React StrictMode's dev-mode simulated
  // mount -> unmount -> remount cycle, so without resetting it here on every
  // mount, a StrictMode remount would leave disposedRef permanently true from
  // the simulated unmount, silently killing every future poll for the
  // lifetime of the component.
  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
    };
  }, []);

  return { status, message, upload };
}
