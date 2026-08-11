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
import { listRoomTaskStatuses } from "@/features/rooms/actions";
import { listPrdAssistRequests } from "../actions";
import type { PrdAssistRequest } from "../schemas";

export type RoomTaskQueueNotice = {
  kind: AITaskKind;
  taskId: string;
};

export type PrdDocumentStatus = "draft" | "accepted";

type RoomTaskStatusContextValue = {
  statuses: RoomTaskStatus[];
  isInitialLoading: boolean;
  hasCompletedInitialRead: boolean;
  hasPrdGeneration: boolean;
  hasPrdTaskSurface: boolean;
  latestPrdTask: RoomTaskStatus | null;
  prdStatus: PrdDocumentStatus | null;
  setPrdStatus: (status: PrdDocumentStatus | null) => void;
  notifyQueued: (notice?: RoomTaskQueueNotice) => void;
  // The reader's own pending/ready/failed PRD requests, read once on mount so
  // a refresh cannot lose one. Recovery only, never a live feed: the popover
  // polls the request it submitted, and this list is what is left over.
  assistRequests: PrdAssistRequest[];
  forgetAssistRequest: (requestId: string) => void;
};

const RoomTaskStatusContext =
  createContext<RoomTaskStatusContextValue | null>(null);

export function useRoomTaskStatus(): RoomTaskStatusContextValue | null {
  return useContext(RoomTaskStatusContext);
}

export function RoomTaskStatusProvider({
  roomId,
  hasPrd = false,
  initialActivePrdTaskIds = [],
  prdStatus: initialPrdStatus = null,
  children,
  fetchTaskStatuses = listRoomTaskStatuses,
  fetchAssistRequests = listPrdAssistRequests,
  taskPollIntervalMs,
}: {
  roomId: string;
  hasPrd?: boolean;
  initialActivePrdTaskIds?: string[];
  prdStatus?: PrdDocumentStatus | null;
  children: ReactNode;
  fetchTaskStatuses?: (roomId: string) => Promise<RoomTaskStatus[]>;
  fetchAssistRequests?: (roomId: string) => Promise<PrdAssistRequest[]>;
  taskPollIntervalMs?: number;
}) {
  const router = useRouter();
  const [statuses, setStatuses] = useState<RoomTaskStatus[]>([]);
  const [prdStatus, setPrdStatus] = useState<PrdDocumentStatus | null>(
    initialPrdStatus,
  );
  const [assistRequests, setAssistRequests] = useState<PrdAssistRequest[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [hasCompletedInitialRead, setHasCompletedInitialRead] =
    useState(false);
  const [optimisticPrdTaskIds, setOptimisticPrdTaskIds] = useState<
    Set<string>
  >(new Set());
  const [awaitingMaterializationTaskIds, setAwaitingMaterializationTaskIds] =
    useState<Set<string>>(new Set());
  const refreshedTerminalTaskIds = useRef(new Set<string>());
  const activePrdTaskIds = useRef(new Set(initialActivePrdTaskIds));
  const optimisticPrdTaskIdsRef = useRef(new Set<string>());
  const pollerRef = useRef<RoomTaskStatusPoller | null>(null);

  useEffect(() => {
    const poller = new RoomTaskStatusPoller({
      intervalMs: taskPollIntervalMs,
      fetchStatuses: () => fetchTaskStatuses(roomId),
      onStatuses: (nextStatuses) => {
        setStatuses(nextStatuses);
        setIsInitialLoading(false);
        setHasCompletedInitialRead(true);

        const terminalPrdTasks = nextStatuses.filter(
          (task) =>
            task.kind === "prd_generate" &&
            isTerminalTaskStatus(task.status),
        );
        for (const task of nextStatuses) {
          if (
            task.kind === "prd_generate" &&
            !isTerminalTaskStatus(task.status)
          ) {
            activePrdTaskIds.current.add(task.taskId);
          }
        }
        if (terminalPrdTasks.length === 0) return;

        setOptimisticPrdTaskIds((current) => {
          const next = new Set(current);
          for (const task of terminalPrdTasks) next.delete(task.taskId);
          return next;
        });

        for (const task of terminalPrdTasks) {
          const taskId = task.taskId;
          const shouldRefresh =
            activePrdTaskIds.current.has(taskId) ||
            optimisticPrdTaskIdsRef.current.has(taskId);
          activePrdTaskIds.current.delete(taskId);
          optimisticPrdTaskIdsRef.current.delete(taskId);
          if (!shouldRefresh) continue;
          if (task.status !== "completed" && task.status !== "cancelled") {
            continue;
          }
          if (task.status === "completed" && !hasPrd) {
            setAwaitingMaterializationTaskIds((current) =>
              new Set(current).add(taskId),
            );
          }
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
  }, [fetchTaskStatuses, hasPrd, roomId, router, taskPollIntervalMs]);

  // Once, on mount. A request already in flight when the page reloaded is
  // recovered here rather than reopening its popover unasked.
  useEffect(() => {
    let active = true;
    void fetchAssistRequests(roomId).then((requests) => {
      if (active) setAssistRequests(requests);
    });
    return () => {
      active = false;
    };
  }, [fetchAssistRequests, roomId]);

  const forgetAssistRequest = useCallback((requestId: string) => {
    setAssistRequests((current) =>
      current.filter((request) => request.id !== requestId),
    );
  }, []);

  const notifyQueued = useCallback((notice?: RoomTaskQueueNotice) => {
    if (notice?.kind === "prd_generate") {
      optimisticPrdTaskIdsRef.current.add(notice.taskId);
      setOptimisticPrdTaskIds((current) =>
        new Set(current).add(notice.taskId),
      );
      // A PRD notice is immediately followed by a client-side navigation to
      // the PRD tab. Waking the poller here -- or from any effect that fires
      // as soon as this state changes -- races that navigation's own RSC
      // fetch with the poller's status fetch (a Server Action); when the
      // faster one resolves first, Next's router silently discards the
      // slower, now-stale navigation instead of applying it, and the tab
      // never actually switches. The optimistic state above already renders
      // the generating view the moment the PRD tab mounts, so the wake is
      // left to PrdGenerating's own mount effect, which by construction
      // cannot run until that navigation has already been applied.
      return;
    }
    pollerRef.current?.notifyQueued();
  }, []);

  const hasPrdGeneration =
    optimisticPrdTaskIds.size > 0 ||
    (!hasPrd && awaitingMaterializationTaskIds.size > 0) ||
    statuses.some(
      (task) =>
        task.kind === "prd_generate" &&
        !isTerminalTaskStatus(task.status),
    );
  const latestPrdTask =
    [...statuses]
      .filter((task) => task.kind === "prd_generate")
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) ||
          left.taskId.localeCompare(right.taskId),
      )
      .at(-1) ?? null;
  const hasPrdRecovery =
    latestPrdTask?.status === "failed" ||
    latestPrdTask?.status === "needs_reauthentication" ||
    latestPrdTask?.status === "usage_limit_reached" ||
    latestPrdTask?.status === "needs_review";
  const hasPrdTaskSurface = hasPrdGeneration || hasPrdRecovery;
  const value = useMemo<RoomTaskStatusContextValue>(
    () => ({
      statuses,
      isInitialLoading,
      hasCompletedInitialRead,
      hasPrdGeneration,
      hasPrdTaskSurface,
      latestPrdTask,
      prdStatus,
      setPrdStatus,
      notifyQueued,
      assistRequests,
      forgetAssistRequest,
    }),
    [
      assistRequests,
      forgetAssistRequest,
      hasCompletedInitialRead,
      hasPrdGeneration,
      hasPrdTaskSurface,
      isInitialLoading,
      latestPrdTask,
      prdStatus,
      notifyQueued,
      statuses,
    ],
  );

  return (
    <RoomTaskStatusContext.Provider value={value}>
      {children}
    </RoomTaskStatusContext.Provider>
  );
}
