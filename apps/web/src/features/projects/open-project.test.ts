import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRoomBackend: vi.fn(),
  listRooms: vi.fn(),
  createRoom: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/rooms/backend", () => ({
  getRoomBackend: mocks.getRoomBackend,
}));

import { openProject } from "./open-project";

const WS = "30000000-0000-4000-8000-000000000003";
const PROJECT = "70000000-0000-4000-8000-000000000007";
const OTHER = "70000000-0000-4000-8000-000000000008";

const room = (id: string, projectId: string, name: string, createdAt: string) => ({
  id,
  projectId,
  name,
  createdAt,
});

describe("openProject", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getRoomBackend.mockResolvedValue({
      listRooms: mocks.listRooms,
      createRoom: mocks.createRoom,
    });
  });

  it("opens the oldest chat", async () => {
    mocks.listRooms.mockResolvedValue([
      room("b", PROJECT, "Later", "2026-11-02"),
      room("a", PROJECT, "Main", "2026-11-01"),
    ]);
    await expect(
      openProject({ workspaceId: WS, projectId: PROJECT }, [PROJECT]),
    ).resolves.toBe("a");
    expect(mocks.createRoom).not.toHaveBeenCalled();
  });

  it("creates Main when the project has no chats", async () => {
    mocks.listRooms.mockResolvedValue([room("x", OTHER, "Else", "2026-11-01")]);
    mocks.createRoom.mockResolvedValue({ id: "main" });
    await expect(
      openProject({ workspaceId: WS, projectId: PROJECT }, [PROJECT]),
    ).resolves.toBe("main");
    expect(mocks.createRoom).toHaveBeenCalledWith({
      workspaceId: WS,
      projectId: PROJECT,
      name: "Main",
    });
  });

  it("refuses a project outside the workspace", async () => {
    await expect(
      openProject({ workspaceId: WS, projectId: PROJECT }, [OTHER]),
    ).resolves.toBeNull();
    expect(mocks.listRooms).not.toHaveBeenCalled();
  });
});
