import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, rpcMock, uploadMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  rpcMock: vi.fn(),
  uploadMock: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));

import {
  getDesignProfileDistillation,
  uploadDesignSystemDocument,
} from "./design-profile-distillation";

beforeEach(() => {
  vi.clearAllMocks();
});

function supabaseStub() {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === "rooms") {
              return {
                data: { workspace_id: "00000000-0000-4000-8000-000000000099" },
                error: null,
              };
            }
            return { data: null, error: null };
          },
        }),
      }),
    }),
    storage: { from: () => ({ upload: uploadMock }) },
    rpc: rpcMock,
  };
}

describe("uploadDesignSystemDocument", () => {
  it("extracts text, uploads bytes, and queues the distill task", async () => {
    createClientMock.mockResolvedValue(supabaseStub());
    uploadMock.mockResolvedValue({ data: { path: "workspace/uuid-brand.md" }, error: null });
    rpcMock.mockResolvedValue({
      data: { id: "00000000-0000-4000-8000-000000000009" },
      error: null,
    });

    const result = await uploadDesignSystemDocument({
      roomId: "00000000-0000-4000-8000-000000000001",
      fileName: "brand.md",
      mimeType: "text/markdown",
      bytes: new TextEncoder().encode("# Brand\nPrimary color is #112233."),
    });

    expect(result).toEqual({
      status: "queued",
      taskId: "00000000-0000-4000-8000-000000000009",
    });
    const objectPathPattern =
      /^00000000-0000-4000-8000-000000000099\/[0-9a-f-]{36}-brand\.md$/;
    expect(rpcMock).toHaveBeenCalledWith(
      "create_design_profile_distill_task",
      expect.objectContaining({
        target_room_id: "00000000-0000-4000-8000-000000000001",
        source_extracted_text: expect.stringContaining("Primary color is #112233."),
        source_file_name: "brand.md",
        source_object_path: expect.stringMatching(objectPathPattern),
      }),
    );
    expect(uploadMock).toHaveBeenCalledWith(
      expect.stringMatching(objectPathPattern),
      expect.anything(),
      expect.anything(),
    );
  });

  it("returns an error without calling the RPC when extraction fails", async () => {
    createClientMock.mockResolvedValue(supabaseStub());
    const result = await uploadDesignSystemDocument({
      roomId: "00000000-0000-4000-8000-000000000001",
      fileName: "brand.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array([0, 1, 2]), // not a real PDF signature
    });
    expect(result.status).toBe("error");
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("getDesignProfileDistillation", () => {
  it("returns the taskId/versionId/isActive on a successful RPC response", async () => {
    createClientMock.mockResolvedValue({ rpc: rpcMock });
    rpcMock.mockResolvedValue({
      data: {
        task_id: "00000000-0000-4000-8000-000000000009",
        version_id: "00000000-0000-4000-8000-000000000010",
        is_active: true,
      },
      error: null,
    });

    const result = await getDesignProfileDistillation(
      "00000000-0000-4000-8000-000000000009",
    );

    expect(result).toEqual({
      taskId: "00000000-0000-4000-8000-000000000009",
      versionId: "00000000-0000-4000-8000-000000000010",
      isActive: true,
    });
    expect(rpcMock).toHaveBeenCalledWith("get_design_profile_distillation", {
      target_task_id: "00000000-0000-4000-8000-000000000009",
    });
  });

  it("returns null when there is no matching row", async () => {
    createClientMock.mockResolvedValue({ rpc: rpcMock });
    rpcMock.mockResolvedValue({ data: null, error: null });

    const result = await getDesignProfileDistillation(
      "00000000-0000-4000-8000-000000000009",
    );

    expect(result).toBeNull();
  });

  it("returns null instead of throwing when the RPC errors", async () => {
    createClientMock.mockResolvedValue({ rpc: rpcMock });
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await getDesignProfileDistillation(
      "00000000-0000-4000-8000-000000000009",
    );

    expect(result).toBeNull();
  });

  it("returns null without calling the RPC when taskId is not a UUID", async () => {
    createClientMock.mockResolvedValue({ rpc: rpcMock });

    const result = await getDesignProfileDistillation("not-a-uuid");

    expect(result).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
