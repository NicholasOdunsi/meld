"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OutgoingStep, SketchLayout } from "@meld/prototype";
import { isTerminalTaskStatus } from "@/features/ai/room-task-status";
import { useRoomTaskStatus } from "@/features/prd/components/room-task-status-provider";
import {
  getDesignScreenGeneration,
  generateDesignScreen,
  type DesignScreenGeneration,
  type GenerateDesignScreenResult,
} from "./design-screen-generation";

type Status = "idle" | "queued" | "running" | "completed" | "failed";
const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 300;
const MAX_MATERIALIZATION_ATTEMPTS = 5;

// getDesignScreenGeneration can return a row before its version has
// materialized (versionId/promoted are NULL while the task is still
// in-flight -- see slice 2c Task 3's fix). Only a non-null versionId means a
// version actually landed; that's the sole signal deliver() should act on.
type MaterializedGeneration = DesignScreenGeneration & { versionId: string };

function isMaterialized(
  generation: DesignScreenGeneration | null,
): generation is MaterializedGeneration {
  return generation !== null && generation.versionId !== null;
}

export function useDesignScreenGeneration({
  roomId,
  access,
  onScreenReady,
}: {
  roomId: string;
  access: "edit" | "view";
  onScreenReady?: () => void | Promise<void>;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const roomTaskStatus = useRoomTaskStatus();
  const notifyRoomTaskQueued = roomTaskStatus?.notifyQueued;
  const delivered = useRef(new Set<string>());
  const roomStatusesRef = useRef(roomTaskStatus?.statuses ?? []);
  const callbackRef = useRef(onScreenReady);
  useEffect(() => {
    callbackRef.current = onScreenReady;
  }, [onScreenReady]);
  useEffect(() => {
    roomStatusesRef.current = roomTaskStatus?.statuses ?? [];
  }, [roomTaskStatus?.statuses]);

  const deliver = useCallback(async (generation: MaterializedGeneration) => {
    if (delivered.current.has(generation.taskId)) return;
    delivered.current.add(generation.taskId);
    try {
      await callbackRef.current?.();
      setStatus("completed");
    } catch {
      delivered.current.delete(generation.taskId);
      setMessage("The generated screen could not be loaded. Try again.");
      setStatus("failed");
    }
  }, []);

  // A task queued by something other than this hook's own start() -- e.g. a
  // Product Agent proposal that queues screen generation directly through a
  // room-proposal RPC -- never sets local taskId, so without this the poll
  // effect below never runs for it. The room's task-status projection already
  // carries every task for the room, so an active design_screen_generate task
  // appearing there is adopted once, the same as if start() had queued it
  // locally. The adoption is deferred out of the effect body (same shape as
  // the poll effect below) rather than set synchronously, so it survives the
  // status projection later marking the same task terminal -- it must stick
  // once adopted, not re-derive every render, or the poll effect would tear
  // itself down the moment the task completes, before it ever reads the
  // materialized result.
  useEffect(() => {
    if (access !== "edit" || taskId) return;
    const activeTaskId =
      roomTaskStatus?.activeDesignScreenGenerationTaskIds[0] ??
      roomTaskStatus?.statuses.find(
        (candidate) =>
          candidate.kind === "design_screen_generate"
          && !isTerminalTaskStatus(candidate.status),
      )?.taskId;
    if (!activeTaskId) return;
    const timer = setTimeout(() => {
      setTaskId(activeTaskId);
      setStatus("running");
      notifyRoomTaskQueued?.();
    }, 0);
    return () => clearTimeout(timer);
  }, [
    access,
    roomTaskStatus?.activeDesignScreenGenerationTaskIds,
    roomTaskStatus?.statuses,
    notifyRoomTaskQueued,
    taskId,
  ]);

  const start = useCallback(async (input: {
    screenId?: string;
    name?: string;
    instruction: string;
    layout?: SketchLayout;
    steps?: OutgoingStep[];
    context?: { existingScreens: { key: string; name: string }[]; danglingTargets: string[] };
  }): Promise<GenerateDesignScreenResult | null> => {
    if (access !== "edit") return null;
    setMessage(null);
    setStatus("queued");
    const result = await generateDesignScreen({
      roomId,
      screenId: input.screenId,
      name: input.name,
      instruction: input.instruction,
      layout: input.layout,
      steps: input.steps,
      context: input.context,
    });
    if (result.status === "queued") {
      setTaskId(result.taskId);
      setStatus("running");
      roomTaskStatus?.notifyQueued({ kind: "design_screen_generate", taskId: result.taskId });
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
        setMessage("Screen generation did not complete. Try again.");
        setStatus("failed");
        return;
      }
      const generation = await getDesignScreenGeneration(taskId);
      if (disposed) return;
      if (isMaterialized(generation)) {
        await deliver(generation);
        return;
      }
      pollAttempts += 1;
      if (task?.status === "completed") materializationAttempts += 1;
      if (
        pollAttempts >= MAX_POLL_ATTEMPTS
        || materializationAttempts >= MAX_MATERIALIZATION_ATTEMPTS
      ) {
        setMessage("Screen generation did not finish in time. Try again.");
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

export type DesignScreenGenerationHook = ReturnType<typeof useDesignScreenGeneration>;
