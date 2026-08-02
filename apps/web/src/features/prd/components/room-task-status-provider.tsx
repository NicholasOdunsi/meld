"use client";

import type { AITaskKind } from "@meld/contracts";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  RoomTaskStatusPoller,
  isTerminalTaskStatus,
  type RoomTaskStatus,
} from "@/features/ai/room-task-status";
import { listRoomTaskStatuses } from "@/features/discovery/actions";

export type RoomTaskQueueNotice = {
  kind: AITaskKind;
  taskId: string;
};

type RoomTaskStatusContextValue = {
  statuses: RoomTaskStatus[];
  isInitialLoading: boolean;
  hasPrdGeneration: boolean;
  notifyQueued: (notice?: RoomTaskQueueNotice) => void;
};

const RoomTaskStatusContext =
  createContext<RoomTaskStatusContextValue | null>(null);

export function useRoomTaskStatus(): RoomTaskStatusContextValue | null {
  return useContext(RoomTaskStatusContext);
}

export function RoomTaskStatusProvider({
  roomId,
  children,
  fetchTaskStatuses = listRoomTaskStatuses,
  taskPollIntervalMs,
}: {
  roomId: string;
  children: ReactNode;
  fetchTaskStatuses?: (roomId: string) => Promise<RoomTaskStatus[]>;
  taskPollIntervalMs?: number;
}) {
  const router = useRouter();
  const [statuses, setStatuses] = useState<RoomTaskStatus[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [optimisticPrdTaskIds, setOptimisticPrdTaskIds] = useState<
    Set<string>
  >(new Set());
  const refreshedTerminalTaskIds = useRef(new Set<string>());
  const activePrdTaskIds = useRef(new Set<string>());
  const optimisticPrdTaskIdsRef = useRef(new Set<string>());
  const pollerRef = useRef<RoomTaskStatusPoller | null>(null);

  useEffect(() => {
    const poller = new RoomTaskStatusPoller({
      intervalMs: taskPollIntervalMs,
      fetchStatuses: () => fetchTaskStatuses(roomId),
      onStatuses: (nextStatuses) => {
        setStatuses(nextStatuses);
        setIsInitialLoading(false);

        const terminalPrdTaskIds = nextStatuses
          .filter(
            (task) =>
              task.kind === "prd_generate" &&
              isTerminalTaskStatus(task.status),
          )
          .map((task) => task.taskId);
        for (const task of nextStatuses) {
          if (
            task.kind === "prd_generate" &&
            !isTerminalTaskStatus(task.status)
          ) {
            activePrdTaskIds.current.add(task.taskId);
          }
        }
        if (terminalPrdTaskIds.length === 0) return;

        setOptimisticPrdTaskIds((current) => {
          const next = new Set(current);
          for (const taskId of terminalPrdTaskIds) next.delete(taskId);
          return next;
        });

        for (const taskId of terminalPrdTaskIds) {
          const shouldRefresh =
            activePrdTaskIds.current.has(taskId) ||
            optimisticPrdTaskIdsRef.current.has(taskId);
          activePrdTaskIds.current.delete(taskId);
          optimisticPrdTaskIdsRef.current.delete(taskId);
          if (!shouldRefresh) continue;
          if (refreshedTerminalTaskIds.current.has(taskId)) continue;
          refreshedTerminalTaskIds.current.add(taskId);
          router.refresh();
        }
      },
      onError: () => setIsInitialLoading(false),
    });
    pollerRef.current = poller;
    poller.start();
    return () => {
      poller.stop();
      pollerRef.current = null;
    };
  }, [fetchTaskStatuses, roomId, router, taskPollIntervalMs]);

  const notifyQueued = useCallback((notice?: RoomTaskQueueNotice) => {
    if (notice?.kind === "prd_generate") {
      optimisticPrdTaskIdsRef.current.add(notice.taskId);
      setOptimisticPrdTaskIds((current) =>
        new Set(current).add(notice.taskId),
      );
    }
    pollerRef.current?.notifyQueued();
  }, []);

  const hasPrdGeneration =
    optimisticPrdTaskIds.size > 0 ||
    statuses.some(
      (task) =>
        task.kind === "prd_generate" &&
        !isTerminalTaskStatus(task.status),
    );
  const value = useMemo<RoomTaskStatusContextValue>(
    () => ({
      statuses,
      isInitialLoading,
      hasPrdGeneration,
      notifyQueued,
    }),
    [hasPrdGeneration, isInitialLoading, notifyQueued, statuses],
  );

  return (
    <RoomTaskStatusContext.Provider value={value}>
      {children}
    </RoomTaskStatusContext.Provider>
  );
}
