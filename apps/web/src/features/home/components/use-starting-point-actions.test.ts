// @vitest-environment jsdom

import {
  act,
  renderHook,
  type RenderHookResult,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRoomFromBrief: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/features/rooms/actions", () => ({
  createRoomFromBrief: mocks.createRoomFromBrief,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));
vi.mock("@astryxdesign/core/Toast", () => ({ useToast: () => vi.fn() }));

import { useStartingPointActions } from "./use-starting-point-actions";
import { roomDraftStorageKey } from "@/features/rooms/components/composer-model";

function selectFile(
  hook: RenderHookResult<ReturnType<typeof useStartingPointActions>, unknown>,
) {
  const file = new File(["brief"], "brief.pdf", { type: "application/pdf" });
  const event = { target: { files: [file], value: "x" } } as unknown as React.ChangeEvent<HTMLInputElement>;
  return act(async () => {
    await hook.result.current.handleFilesSelected(event);
  });
}

describe("useStartingPointActions import", () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.createRoomFromBrief.mockReset();
    window.sessionStorage.clear();
  });

  it("navigates to the room when the agent reviewed the brief", async () => {
    mocks.createRoomFromBrief.mockResolvedValue({
      ready: true,
      roomId: "room-1",
      failedFileNames: [],
    });
    const hook = renderHook(() =>
      useStartingPointActions("org-1", "project-1"),
    );
    await selectFile(hook);
    expect(mocks.push).toHaveBeenCalledWith("/org-1/rooms/room-1");
  });

  it("saves a restorable draft with the brief when the agent is not ready", async () => {
    mocks.createRoomFromBrief.mockResolvedValue({
      ready: false,
      roomId: "room-2",
      stagedAttachmentIds: ["att-1"],
      failedFileNames: [],
    });
    const hook = renderHook(() =>
      useStartingPointActions("org-1", "project-1"),
    );
    await selectFile(hook);
    const draft = JSON.parse(
      window.sessionStorage.getItem(roomDraftStorageKey("room-2")) ?? "{}",
    );
    expect(draft.attachmentIds).toEqual(["att-1"]);
    expect(draft.body).toContain("@Product Agent");
    expect(mocks.push).toHaveBeenCalledWith("/org-1/rooms/room-2");
  });
});
