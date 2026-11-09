"use client";

import type { RoomActivity } from "@meld/contracts";
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
import { getWorkspaceActivity } from "./actions";
import { rollUpProjects, type ProjectActivity } from "./rollup";

export const ACTIVITY_POLL_VISIBLE_MS = 5000;
export const ACTIVITY_POLL_HIDDEN_MS = 30000;

type WorkspaceActivity = {
  rooms: RoomActivity[];
  byRoom: Map<string, RoomActivity>;
  byProject: Map<string, ProjectActivity>;
  refresh: () => Promise<void>;
};

const EMPTY: WorkspaceActivity = {
  rooms: [],
  byRoom: new Map(),
  byProject: new Map(),
  refresh: async () => {},
};

const Context = createContext<WorkspaceActivity>(EMPTY);

export function WorkspaceActivityProvider({
  workspaceId,
  initial,
  children,
}: {
  workspaceId: string;
  initial: RoomActivity[];
  children: ReactNode;
}) {
  const [rooms, setRooms] = useState(initial);
  const workspaceRef = useRef(workspaceId);
  useEffect(() => {
    workspaceRef.current = workspaceId;
  }, [workspaceId]);

  const refresh = useCallback(async () => {
    try {
      setRooms(await getWorkspaceActivity(workspaceRef.current));
    } catch {
      // Keep the last good snapshot; the next poll tries again.
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      const delay =
        document.visibilityState === "visible"
          ? ACTIVITY_POLL_VISIBLE_MS
          : ACTIVITY_POLL_HIDDEN_MS;
      timer = setTimeout(async () => {
        await refresh();
        schedule();
      }, delay);
    };
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [refresh]);

  const value = useMemo<WorkspaceActivity>(
    () => ({
      rooms,
      byRoom: new Map(rooms.map((room) => [room.roomId, room])),
      byProject: rollUpProjects(rooms),
      refresh,
    }),
    [rooms, refresh],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useWorkspaceActivity(): WorkspaceActivity {
  return useContext(Context);
}
