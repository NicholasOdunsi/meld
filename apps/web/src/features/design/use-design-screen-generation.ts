"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SketchLayout } from "@meld/prototype";
import type { Provider } from "@meld/contracts";
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

// Exported so a caller that starts a generation without using this hook
// itself -- `RoomPlane`'s empty-prototype starting points call the server
// action directly, not `start()` -- can still bound its own "give up and
// hand control back" fallback to the same worst case this hook's poll loop
// gives up at. Two of this hook's three failure paths (`MAX_POLL_ATTEMPTS`,
// `MAX_MATERIALIZATION_ATTEMPTS`) never change the task's row status, so a
// caller watching the room's task-status projection alone would never see
// them settle; this bound is what still frees such a caller's UI, without a
// reload, when the task simply never resolves.
export const DESIGN_SCREEN_GENERATION_TIMEOUT_MS =
  POLL_INTERVAL_MS * MAX_POLL_ATTEMPTS;

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

export type StartInput = {
  screenId?: string;
  name?: string;
  instruction: string;
  provider?: Provider;
  model?: string;
  layout?: SketchLayout;
  context?: {
    existingScreens: { key: string; name: string }[];
    danglingTargets: string[];
    existingLayouts?: { key: string; name: string }[];
    componentSource?: string | null;
    existingComponents?: { className: string; declarations: string[] }[];
  };
};

export function aggregateStatus(
  activeTaskIds: string[],
  lastOutcome: "completed" | "failed" | null,
): Status {
  if (activeTaskIds.length > 0) return "running";
  return lastOutcome ?? "idle";
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
  const [activeTaskIds, setActiveTaskIds] = useState<string[]>([]);
  const [lastOutcome, setLastOutcome] = useState<"completed" | "failed" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const status = aggregateStatus(activeTaskIds, lastOutcome);
  const taskId = activeTaskIds[activeTaskIds.length - 1] ?? null;
  const roomTaskStatus = useRoomTaskStatus();
  const notifyRoomTaskQueued = roomTaskStatus?.notifyQueued;
  const delivered = useRef(new Set<string>());
  const roomStatusesRef = useRef(roomTaskStatus?.statuses ?? []);
  const callbackRef = useRef(onScreenReady);
  const attemptsRef = useRef(new Map<string, { poll: number; materialize: number }>());
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
      setLastOutcome("completed");
    } catch {
      delivered.current.delete(generation.taskId);
      setMessage("The generated screen could not be loaded. Try again.");
      setLastOutcome("failed");
    } finally {
      setActiveTaskIds((prev) => prev.filter((id) => id !== generation.taskId));
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
    if (access !== "edit") return;
    const active = roomTaskStatus?.activeDesignScreenGenerationTaskIds ?? [];
    const fresh = active.filter((id) => !activeTaskIds.includes(id) && !delivered.current.has(id));
    if (fresh.length === 0) return;
    const timer = setTimeout(() => {
      setActiveTaskIds((prev) => [...prev, ...fresh.filter((id) => !prev.includes(id))]);
      notifyRoomTaskQueued?.();
    }, 0);
    return () => clearTimeout(timer);
  }, [access, roomTaskStatus?.activeDesignScreenGenerationTaskIds, notifyRoomTaskQueued, activeTaskIds]);

  const enqueue = useCallback(async (input: StartInput): Promise<GenerateDesignScreenResult | null> => {
    if (access !== "edit") return null;
    setMessage(null);
    const result = await generateDesignScreen({ roomId, ...input });
    if (result.status === "queued") {
      setActiveTaskIds((prev) => (prev.includes(result.taskId) ? prev : [...prev, result.taskId]));
      roomTaskStatus?.notifyQueued({ kind: "design_screen_generate", taskId: result.taskId });
    } else {
      setMessage(result.message);
      setLastOutcome("failed");
    }
    return result;
  }, [access, roomId, roomTaskStatus]);

  const start = useCallback((input: StartInput) => enqueue(input), [enqueue]);
  const startMany = useCallback(async (inputs: StartInput[]) => {
    await Promise.all(inputs.map((input) => enqueue(input)));
  }, [enqueue]);

  const activeKey = activeTaskIds.join(",");
  useEffect(() => {
    if (!activeKey || access !== "edit") return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      for (const id of activeKey.split(",")) {
        const task = roomStatusesRef.current.find((c) => c.taskId === id);
        if (task && isTerminalTaskStatus(task.status) && task.status !== "completed") {
          setMessage("Screen generation did not complete. Try again.");
          setLastOutcome("failed");
          setActiveTaskIds((prev) => prev.filter((x) => x !== id));
          continue;
        }
        const generation = await getDesignScreenGeneration(id);
        if (disposed) return;
        if (isMaterialized(generation)) {
          await deliver(generation);
          continue;
        }
        const a = attemptsRef.current.get(id) ?? { poll: 0, materialize: 0 };
        a.poll += 1;
        if (task?.status === "completed") a.materialize += 1;
        attemptsRef.current.set(id, a);
        if (a.poll >= MAX_POLL_ATTEMPTS || a.materialize >= MAX_MATERIALIZATION_ATTEMPTS) {
          setMessage("Screen generation did not finish in time. Try again.");
          setLastOutcome("failed");
          setActiveTaskIds((prev) => prev.filter((x) => x !== id));
        }
      }
      if (!disposed) timer = setTimeout(poll, POLL_INTERVAL_MS);
    };
    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [access, deliver, activeKey]);

  return { status, taskId, message, start, startMany, isGenerating: activeTaskIds.length > 0, activeTaskIds };
}

export type DesignScreenGenerationHook = ReturnType<typeof useDesignScreenGeneration>;
