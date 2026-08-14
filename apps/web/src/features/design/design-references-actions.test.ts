import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { recordFigmaReferences, removeDesignReference } from "./design-references-actions";

const ROOM_ID = "40000000-0000-4000-8000-000000000004";
const REFERENCE_ID = "80000000-0000-4000-8000-000000000008";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordFigmaReferences", () => {
  it("calls add_design_reference once per unique Figma URL, status pending", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });

    await recordFigmaReferences({
      roomId: ROOM_ID,
      body:
        "see https://figma.com/design/a?node-id=1-2 and https://figma.com/design/a?node-id=1-2 and https://x.com/y",
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("add_design_reference", {
      target_room_id: ROOM_ID,
      url: "https://figma.com/design/a?node-id=1-2",
      ref_title: null,
      thumb: null,
      status: "pending",
    });
  });

  it("calls add_design_reference for each of multiple distinct Figma URLs", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });

    await recordFigmaReferences({
      roomId: ROOM_ID,
      body: "https://figma.com/design/a and https://figma.com/design/b",
    });

    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("does nothing when the body has no Figma URLs", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });

    await recordFigmaReferences({ roomId: ROOM_ID, body: "just plain text" });

    expect(rpc).not.toHaveBeenCalled();
  });

  it("swallows an RPC error and still resolves", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    mocks.createClient.mockResolvedValue({ rpc });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      recordFigmaReferences({ roomId: ROOM_ID, body: "https://figma.com/design/a" }),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("swallows a thrown RPC rejection for one URL without aborting the others", async () => {
    const rpc = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.createClient.mockResolvedValue({ rpc });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      recordFigmaReferences({
        roomId: ROOM_ID,
        body: "https://figma.com/design/a and https://figma.com/design/b",
      }),
    ).resolves.toBeUndefined();

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("resolves even on total failure (e.g. createClient throws)", async () => {
    mocks.createClient.mockRejectedValue(new Error("no client"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      recordFigmaReferences({ roomId: ROOM_ID, body: "https://figma.com/design/a" }),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("removeDesignReference", () => {
  it("maps a successful delete to status removed", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(removeDesignReference(REFERENCE_ID)).resolves.toEqual({
      status: "removed",
    });
    expect(rpc).toHaveBeenCalledWith("delete_design_reference", {
      target_reference_id: REFERENCE_ID,
    });
  });

  it("maps an RPC error to status error", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(removeDesignReference(REFERENCE_ID)).resolves.toEqual({
      status: "error",
    });
  });

  it("maps an invalid id to status error without calling the RPC", async () => {
    const rpc = vi.fn();
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(removeDesignReference("not-a-uuid")).resolves.toEqual({
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a thrown RPC rejection to status error", async () => {
    const rpc = vi.fn(async () => {
      throw new Error("network down");
    });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(removeDesignReference(REFERENCE_ID)).resolves.toEqual({
      status: "error",
    });
  });
});
