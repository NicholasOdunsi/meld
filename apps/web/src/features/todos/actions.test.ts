import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteTodoItems, moveTodoItems, saveTodo, setTimeZone } from "./actions";

const WS = "b2000000-0000-4000-8000-000000000001";
const ID = "b8000000-0000-4000-8000-000000000001";

describe("todo actions", () => {
  beforeEach(() => rpc.mockReset().mockResolvedValue({ data: null, error: null }));

  it("saves a valid line", async () => {
    await expect(saveTodo({ workspaceId: WS, id: ID, text: " Ship it ", projectId: null, position: 1 })).resolves.toEqual({ status: "ok" });
    expect(rpc).toHaveBeenCalledWith("save_todo_item", expect.objectContaining({ item_text: "Ship it" }));
  });

  it("refuses an empty line without calling the database", async () => {
    await expect(saveTodo({ workspaceId: WS, id: ID, text: "   ", projectId: null, position: 1 })).resolves.toMatchObject({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("moves lines", async () => {
    await expect(moveTodoItems({ workspaceId: WS, ids: [ID], stage: "done" })).resolves.toEqual({ status: "ok" });
    expect(rpc).toHaveBeenCalledWith("set_todo_stage", expect.objectContaining({ new_stage: "done" }));
  });

  it("refuses an unknown stage", async () => {
    await expect(moveTodoItems({ workspaceId: WS, ids: [ID], stage: "archived" as never })).resolves.toMatchObject({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns an error result when the database fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(deleteTodoItems({ workspaceId: WS, ids: [ID] })).resolves.toEqual({
      status: "error", message: "We could not update your to-dos. Try again.",
    });
  });

  it("refuses a malformed time zone", async () => {
    await expect(setTimeZone("not a zone!")).resolves.toMatchObject({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
