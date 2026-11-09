import { describe, expect, it, vi } from "vitest";
import { deleteTodos, moveTodos, readTodos, writeTimeZone, writeTodo } from "./todo-store";

const WS = "b2000000-0000-4000-8000-000000000001";
const ID = "b8000000-0000-4000-8000-000000000001";

const client = (data: unknown, error: { message: string } | null = null) => ({ rpc: vi.fn().mockResolvedValue({ data, error }) });

describe("todo-store", () => {
  it("reads and maps rows, dropping malformed ones", async () => {
    const c = client([
      { id: ID, project_id: null, text: "Ship it", stage: "in_progress", position: 1, created_at: "2026-11-10T06:00:00Z" },
      { id: "not-a-uuid", project_id: null, text: "x", stage: "todo", position: 2, created_at: "" },
    ]);
    await expect(readTodos(c, WS)).resolves.toEqual([
      { id: ID, projectId: null, text: "Ship it", stage: "in_progress", position: 1, createdAt: "2026-11-10T06:00:00Z" },
    ]);
    expect(c.rpc).toHaveBeenCalledWith("list_todo_items", { target_workspace_id: WS });
  });

  it("writes a line", async () => {
    const c = client(null);
    await writeTodo(c, { workspaceId: WS, id: ID, text: "Ship it", projectId: null, position: 3 });
    expect(c.rpc).toHaveBeenCalledWith("save_todo_item", {
      target_workspace_id: WS, item_id: ID, item_text: "Ship it", item_project_id: null, item_position: 3,
    });
  });

  it("moves lines between stages", async () => {
    const c = client(null);
    await moveTodos(c, { workspaceId: WS, ids: [ID], stage: "in_progress" });
    expect(c.rpc).toHaveBeenCalledWith("set_todo_stage", { target_workspace_id: WS, item_ids: [ID], new_stage: "in_progress" });
  });

  it("deletes lines", async () => {
    const c = client(null);
    await deleteTodos(c, { workspaceId: WS, ids: [ID] });
    expect(c.rpc).toHaveBeenCalledWith("delete_todo_items", { target_workspace_id: WS, item_ids: [ID] });
  });

  it("sets the time zone", async () => {
    const c = client(null);
    await writeTimeZone(c, "Africa/Lagos");
    expect(c.rpc).toHaveBeenCalledWith("set_my_time_zone", { zone: "Africa/Lagos" });
  });

  it("throws a friendly error on failure", async () => {
    await expect(readTodos(client(null, { message: "x" }), WS)).rejects.toThrow("We could not load your to-dos.");
  });
});
