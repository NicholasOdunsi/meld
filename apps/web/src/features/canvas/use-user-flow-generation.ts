"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FlowDocument } from "@meld/contracts";
import { useRoomTaskStatus } from "@/features/prd/components/room-task-status-provider";
import {
  getUserFlowGeneration,
  generateUserFlow,
  type GenerateUserFlowResult,
  type UserFlowGeneration,
} from "./user-flow-generation";

type Status = "idle" | "queued" | "running" | "completed" | "needs_context" | "failed";

export function useUserFlowGeneration({
  roomId,
  access,
  onGenerationReady,
}: {
  roomId: string;
  access: "edit" | "view";
  onGenerationReady?: (generation: UserFlowGeneration) => void;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const roomTaskStatus = useRoomTaskStatus();
  const applied = useRef(new Set<string>());
  const roomStatusesRef = useRef(roomTaskStatus?.statuses ?? []);
  const callbackRef = useRef(onGenerationReady);
  useEffect(() => {
    callbackRef.current = onGenerationReady;
  }, [onGenerationReady]);
  useEffect(() => {
    roomStatusesRef.current = roomTaskStatus?.statuses ?? [];
  }, [roomTaskStatus?.statuses]);

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
    const poll = async () => {
      const task = roomStatusesRef.current.find((candidate) => candidate.taskId === taskId);
      if (task?.status === "failed" || task?.status === "cancelled") {
        setMessage("User flow generation did not complete. Try again.");
        setStatus("failed");
        return;
      }
      const generation = await getUserFlowGeneration(taskId);
      if (disposed) return;
      if (generation && !applied.current.has(generation.taskId)) {
        applied.current.add(generation.taskId);
        setStatus("completed");
        callbackRef.current?.(generation);
        return;
      }
      timer = setTimeout(poll, 2000);
    };
    timer = setTimeout(poll, 2000);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [access, taskId]);

  return { status, taskId, message, start };
}

export type UserFlowGenerationHook = ReturnType<typeof useUserFlowGeneration>;

export function flowDocumentForTesting(document: FlowDocument): FlowDocument {
  return document;
}
