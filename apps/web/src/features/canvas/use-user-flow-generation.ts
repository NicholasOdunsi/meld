"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isTerminalTaskStatus } from "@/features/ai/room-task-status";
import { useRoomTaskStatus } from "@/features/prd/components/room-task-status-provider";
import {
  getUserFlowGeneration,
  generateUserFlow,
  listUnappliedUserFlowGenerations,
  type GenerateUserFlowResult,
  type UserFlowGeneration,
} from "./user-flow-generation";

type Status = "idle" | "queued" | "running" | "completed" | "needs_context" | "failed";
const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 300;
const MAX_MATERIALIZATION_ATTEMPTS = 5;

export function useUserFlowGeneration({
  roomId,
  access,
  initialTaskId = null,
  onGenerationReady,
}: {
  roomId: string;
  access: "edit" | "view";
  initialTaskId?: string | null;
  onGenerationReady?: (generation: UserFlowGeneration) => void | Promise<void>;
}) {
  const [status, setStatus] = useState<Status>(
    initialTaskId ? "running" : "idle",
  );
  const [taskId, setTaskId] = useState<string | null>(initialTaskId);
  const [message, setMessage] = useState<string | null>(null);
  const roomTaskStatus = useRoomTaskStatus();
  const notifyRoomTaskQueued = roomTaskStatus?.notifyQueued;
  const applied = useRef(new Set<string>());
  const roomStatusesRef = useRef(roomTaskStatus?.statuses ?? []);
  const callbackRef = useRef(onGenerationReady);
  useEffect(() => {
    callbackRef.current = onGenerationReady;
  }, [onGenerationReady]);
  useEffect(() => {
    roomStatusesRef.current = roomTaskStatus?.statuses ?? [];
  }, [roomTaskStatus?.statuses]);

  const deliver = useCallback(async (generation: UserFlowGeneration) => {
    if (applied.current.has(generation.taskId)) return;
    applied.current.add(generation.taskId);
    try {
      await callbackRef.current?.(generation);
      setStatus("completed");
    } catch {
      applied.current.delete(generation.taskId);
      setMessage("The generated flow could not be added to the canvas. Try again.");
      setStatus("failed");
    }
  }, []);

  useEffect(() => {
    if (access !== "edit" || taskId) return;
    let disposed = false;
    void listUnappliedUserFlowGenerations(roomId).then(async (generations) => {
      for (const generation of generations) {
        if (disposed) return;
        await deliver(generation);
      }
    });
    return () => {
      disposed = true;
    };
  }, [access, deliver, roomId, taskId]);

  // A task queued by something other than this hook's own start() -- most
  // notably accepting a Product Agent proposal's "Create user flow" button,
  // which queues generation directly through a room-proposal RPC -- never
  // sets local taskId, so without this the poll effect below never runs for
  // it. The room's task-status projection already carries every task for the
  // room (that's what the terminal-status check inside the poll effect reads
  // it for), so an active user_flow_generate task appearing there is adopted
  // once, the same as if start() had queued it locally. The adoption itself
  // is deferred out of the effect body (same shape as the poll effect below)
  // rather than set synchronously, so it survives the status projection
  // later marking the same task terminal -- it must stick once adopted, not
  // re-derive every render, or the poll effect would tear itself down the
  // moment the task completes, before it ever reads the materialized result.
  useEffect(() => {
    if (access !== "edit" || taskId) return;
    const activeTaskId =
      roomTaskStatus?.activeUserFlowGenerationTaskIds[0] ??
      roomTaskStatus?.statuses.find(
        (candidate) =>
          candidate.kind === "user_flow_generate" &&
          !isTerminalTaskStatus(candidate.status),
      )?.taskId;
    if (!activeTaskId) return;
    const timer = setTimeout(() => {
      setTaskId(activeTaskId);
      setStatus("running");
      // This hook only exists after the User Flows destination has mounted, so
      // waking the room poller here cannot race the navigation that exposed it.
      notifyRoomTaskQueued?.();
    }, 0);
    return () => clearTimeout(timer);
  }, [
    access,
    roomTaskStatus?.activeUserFlowGenerationTaskIds,
    roomTaskStatus?.statuses,
    notifyRoomTaskQueued,
    taskId,
  ]);

  const start = useCallback(async (clarification?: string): Promise<GenerateUserFlowResult | null> => {
    if (access !== "edit") return null;
    setMessage(null);
    setStatus("queued");
    const result = await generateUserFlow({ roomId, clarification });
    if (result.status === "queued") {
      setTaskId(result.taskId);
      setStatus("running");
      roomTaskStatus?.notifyQueued({ kind: "user_flow_generate", taskId: result.taskId });
    } else if (result.status === "needs_context") {
      setTaskId(null);
      setMessage(result.question);
      setStatus("needs_context");
    } else {
      setTaskId(null);
      setMessage(result.message);
      setStatus("failed");
    }
    return result;
  }, [access, roomId, roomTaskStatus]);

  useEffect(() => {
    if (!taskId || access !== "edit") return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pollAttempts = 0;
    let materializationAttempts = 0;
    const poll = async () => {
      const task = roomStatusesRef.current.find((candidate) => candidate.taskId === taskId);
      if (task && isTerminalTaskStatus(task.status) && task.status !== "completed") {
        setMessage("User flow generation did not complete. Try again.");
        setStatus("failed");
        return;
      }
      const generation = await getUserFlowGeneration(taskId);
      if (disposed) return;
      if (generation) {
        await deliver(generation);
        return;
      }
      pollAttempts += 1;
      if (task?.status === "completed") materializationAttempts += 1;
      if (
        pollAttempts >= MAX_POLL_ATTEMPTS
        || materializationAttempts >= MAX_MATERIALIZATION_ATTEMPTS
      ) {
        setMessage("User flow generation did not finish in time. Try again.");
        setStatus("failed");
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };
    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [access, deliver, taskId]);

  return { status, taskId, message, start };
}

export type UserFlowGenerationHook = ReturnType<typeof useUserFlowGeneration>;
