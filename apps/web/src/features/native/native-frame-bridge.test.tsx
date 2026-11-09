// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import type { RoomActivity } from "@meld/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceActivityProvider } from "@/features/activity/workspace-activity-provider";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  createProject: vi.fn(),
  createProjectTab: vi.fn(),
  renameProject: vi.fn(),
  deleteProjectAndChats: vi.fn(),
  getWorkspaceActivity: vi.fn(),
  pathname: "/ws/rooms/r1",
  search: "tab=prd",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock("@/features/projects/actions", () => ({
  createProject: mocks.createProject,
  createProjectTab: mocks.createProjectTab,
  renameProject: mocks.renameProject,
  deleteProjectAndChats: mocks.deleteProjectAndChats,
}));
vi.mock("@/features/todos/actions", () => ({
  saveTodo: vi.fn().mockResolvedValue({ status: "ok" }),
  moveTodoItems: vi.fn().mockResolvedValue({ status: "ok" }),
  deleteTodoItems: vi.fn().mockResolvedValue({ status: "ok" }),
  setTimeZone: vi.fn().mockResolvedValue({ status: "ok" }),
}));
vi.mock("@/features/activity/actions", () => ({
  getWorkspaceActivity: (id: string) => mocks.getWorkspaceActivity(id),
}));

import type { FrameHandlers } from "./bridge";
import { NativeFrameBridge } from "./native-frame-bridge";

type TestWindow = Window & { webkit?: unknown; __orionFrame?: FrameHandlers };
const WS = "ws";
const props = {
  workspaceId: WS,
  projects: [{ id: "p1", name: "Orion", icon: "folder", color: "blue" }],
  tabs: [{ id: "r1", projectId: "p1", name: "Main", createdAt: "2026-11-01" }],
  hasTasteUpdates: true,
  todos: [] as {
    id: string;
    projectId: string | null;
    text: string;
    stage: "todo" | "in_progress" | "done";
    position: number;
  }[],
};
const workingRoom: RoomActivity = {
  roomId: "r1",
  projectId: "p1",
  roomName: "Main",
  state: "working",
  reason: null,
  taskKind: "room_reply",
  taskStatus: "running",
  provider: "claude",
  proposalKind: null,
  proposalMessageId: null,
  occurredAt: null,
  lastActivityAt: null,
};
const frame = () => (window as TestWindow).__orionFrame!;

describe("NativeFrameBridge", () => {
  let postMessage: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    postMessage = vi.fn();
    mocks.getWorkspaceActivity.mockResolvedValue([]);
    (window as TestWindow).webkit = { messageHandlers: { orion: { postMessage } } };
  });
  afterEach(() => {
    delete (window as TestWindow).webkit;
    vi.clearAllMocks();
  });

  it("posts the frame snapshot with the current address", () => {
    render(<NativeFrameBridge {...props} />);
    expect(postMessage).toHaveBeenCalledWith({
      v: 1,
      type: "frame",
      path: "/ws/rooms/r1?tab=prd",
      activity: { projects: [], tabs: [] },
      ...props,
    });
  });

  it("posts non-idle project and tab activity with hat labels", () => {
    render(
      <WorkspaceActivityProvider workspaceId={WS} initial={[workingRoom]}>
        <NativeFrameBridge {...props} />
      </WorkspaceActivityProvider>,
    );
    expect(postMessage).toHaveBeenCalledWith({
      v: 1,
      type: "frame",
      path: "/ws/rooms/r1?tab=prd",
      ...props,
      activity: {
        projects: [{ id: "p1", state: "working", label: "Orion: working" }],
        tabs: [{ id: "r1", state: "working", label: "Main: working" }],
      },
    });
  });

  it("navigates only within the site", () => {
    render(<NativeFrameBridge {...props} />);
    expect(frame().navigate("/ws/inspiration")).toEqual({ status: "ok", path: "/ws/inspiration" });
    expect(mocks.push).toHaveBeenCalledWith("/ws/inspiration");
    expect(frame().navigate("https://evil.example")).toMatchObject({ status: "error" });
    expect(frame().navigate("//evil.example")).toMatchObject({ status: "error" });
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it("creates a tab and says where it is", async () => {
    mocks.createProjectTab.mockResolvedValue({ status: "ok", roomId: "r2" });
    render(<NativeFrameBridge {...props} />);
    let result;
    await act(async () => {
      result = await frame().createTab("p1");
    });
    expect(mocks.createProjectTab).toHaveBeenCalledWith({ workspaceId: WS, projectId: "p1" });
    expect(result).toEqual({ status: "ok", path: "/ws/rooms/r2" });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("creates a project, ignoring an unknown colour", async () => {
    mocks.createProject.mockResolvedValue({ status: "ok", project: { id: "p9" } });
    render(<NativeFrameBridge {...props} />);
    let result;
    await act(async () => {
      result = await frame().createProject({ name: "Hermord", color: "chartreuse", icon: "rocket" });
    });
    expect(mocks.createProject).toHaveBeenCalledWith({
      workspaceId: WS,
      name: "Hermord",
      color: undefined,
      icon: "rocket",
    });
    expect(result).toEqual({ status: "ok", path: "/ws/projects/p9" });
  });

  it("passes delete failures back as messages", async () => {
    mocks.deleteProjectAndChats.mockResolvedValue({ status: "error", message: "We could not delete the project." });
    render(<NativeFrameBridge {...props} />);
    let result;
    await act(async () => {
      result = await frame().deleteProject("p1");
    });
    expect(result).toEqual({ status: "error", message: "We could not delete the project." });
  });

  it("turns a thrown action into a plain error", async () => {
    mocks.renameProject.mockRejectedValue(new Error("network"));
    render(<NativeFrameBridge {...props} />);
    let result;
    await act(async () => {
      result = await frame().renameProject("p1", "New");
    });
    expect(result).toMatchObject({ status: "error" });
  });

  it("posts to-dos in the frame snapshot", () => {
    const todos = [
      {
        id: "t1",
        projectId: null,
        text: "Ship it",
        stage: "in_progress" as const,
        position: 1,
      },
    ];
    render(<NativeFrameBridge {...props} todos={todos} />);
    expect(postMessage.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "frame",
      todos: [{ id: "t1", text: "Ship it", stage: "in_progress" }],
    });
  });

  it("saves, moves, deletes and sets the time zone through the page actions", async () => {
    const { saveTodo, moveTodoItems, deleteTodoItems, setTimeZone } =
      await import("@/features/todos/actions");
    render(<NativeFrameBridge {...props} todos={[]} />);
    await expect(
      frame().saveTodo({
        id: "t1",
        text: "Ship it",
        projectId: null,
        position: 1,
      }),
    ).resolves.toEqual({ status: "ok" });
    expect(saveTodo).toHaveBeenCalledWith({
      workspaceId: WS,
      id: "t1",
      text: "Ship it",
      projectId: null,
      position: 1,
    });
    await frame().moveTodos(["t1"], "in_progress");
    expect(moveTodoItems).toHaveBeenCalledWith({
      workspaceId: WS,
      ids: ["t1"],
      stage: "in_progress",
    });
    await frame().deleteTodos(["t1"]);
    expect(deleteTodoItems).toHaveBeenCalledWith({
      workspaceId: WS,
      ids: ["t1"],
    });
    await frame().setTimeZone("Africa/Lagos");
    expect(setTimeZone).toHaveBeenCalledWith("Africa/Lagos");
  });
});
