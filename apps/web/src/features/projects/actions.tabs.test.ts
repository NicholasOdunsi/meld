import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProjectBackend: vi.fn(),
  getRoomBackend: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  listRooms: vi.fn(),
  createRoom: vi.fn(),
  deleteRoom: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("./backend", () => ({ getProjectBackend: mocks.getProjectBackend }));
vi.mock("@/features/rooms/backend", () => ({
  getRoomBackend: mocks.getRoomBackend,
}));

import {
  createProject,
  createProjectTab,
  deleteProjectAndChats,
} from "./actions";

const WS = "30000000-0000-4000-8000-000000000003";
const PROJECT = "70000000-0000-4000-8000-000000000007";
const OTHER = "70000000-0000-4000-8000-000000000008";

const room = (id: string, projectId: string, name: string, createdAt: string) => ({
  id,
  projectId,
  name,
  createdAt,
});

describe("project tabs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getProjectBackend.mockResolvedValue({
      createProject: mocks.createProject,
      deleteProject: mocks.deleteProject,
    });
    mocks.getRoomBackend.mockResolvedValue({
      listRooms: mocks.listRooms,
      createRoom: mocks.createRoom,
      deleteRoom: mocks.deleteRoom,
    });
  });

  it("creates a Main tab with every new project", async () => {
    const project = { id: PROJECT, workspaceId: WS, name: "Hermord" };
    mocks.createProject.mockResolvedValue(project);
    mocks.createRoom.mockResolvedValue({ id: "r1" });

    await expect(createProject({ workspaceId: WS, name: "Hermord" })).resolves
      .toEqual({ status: "ok", project });
    expect(mocks.createRoom).toHaveBeenCalledWith({
      workspaceId: WS,
      projectId: PROJECT,
      name: "Main",
    });
  });

  it("still creates the project if Main fails", async () => {
    const project = { id: PROJECT, workspaceId: WS, name: "Hermord" };
    mocks.createProject.mockResolvedValue(project);
    mocks.createRoom.mockRejectedValue(new Error("boom"));

    await expect(createProject({ workspaceId: WS, name: "Hermord" })).resolves
      .toEqual({ status: "ok", project });
  });

  it("names a new tab after the project's existing tabs only", async () => {
    mocks.listRooms.mockResolvedValue([
      room("a", PROJECT, "Main", "2026-11-01"),
      room("b", PROJECT, "New chat", "2026-11-02"),
      room("c", OTHER, "New chat 2", "2026-11-02"),
    ]);
    mocks.createRoom.mockResolvedValue({ id: "new" });

    await expect(
      createProjectTab({ workspaceId: WS, projectId: PROJECT }),
    ).resolves.toEqual({ status: "ok", roomId: "new" });
    expect(mocks.createRoom).toHaveBeenCalledWith({
      workspaceId: WS,
      projectId: PROJECT,
      name: "New chat 2",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/${WS}`, "layout");
  });

  it("returns a plain error when a tab cannot be created", async () => {
    mocks.listRooms.mockRejectedValue(new Error("db"));
    await expect(
      createProjectTab({ workspaceId: WS, projectId: PROJECT }),
    ).resolves.toEqual({ status: "error", message: "We could not open a new tab." });
  });

  it("deletes a project's chats, then the project", async () => {
    mocks.listRooms.mockResolvedValue([
      room("a", PROJECT, "Main", "2026-11-01"),
      room("x", OTHER, "Keep", "2026-11-01"),
    ]);
    await expect(
      deleteProjectAndChats({ workspaceId: WS, projectId: PROJECT }),
    ).resolves.toEqual({ status: "deleted" });
    expect(mocks.deleteRoom).toHaveBeenCalledTimes(1);
    expect(mocks.deleteRoom).toHaveBeenCalledWith({ workspaceId: WS, roomId: "a" });
    expect(mocks.deleteProject).toHaveBeenCalledWith({
      workspaceId: WS,
      projectId: PROJECT,
    });
  });

  it("keeps the project when a chat fails to delete", async () => {
    mocks.listRooms.mockResolvedValue([room("a", PROJECT, "Main", "2026-11-01")]);
    mocks.deleteRoom.mockRejectedValue(new Error("no"));
    await expect(
      deleteProjectAndChats({ workspaceId: WS, projectId: PROJECT }),
    ).resolves.toMatchObject({ status: "error" });
    expect(mocks.deleteProject).not.toHaveBeenCalled();
  });
});
