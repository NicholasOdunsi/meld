// @vitest-environment jsdom
//
// Full-stack fake-harness integration test for the design-system upload
// banner wired into Canvas (Task 10 of
// docs/superpowers/plans/2026-08-15-design-system-profile-banner.md).
//
// Unlike user-flow-trial-canvas.test.tsx, this file does NOT mock
// @/features/design/design-profile-reader or
// @/features/design/design-profile-distillation (or the DesignSystemBanner
// component or its hook) -- it drives the whole loop for real: banner ->
// useDesignProfileDistillation -> uploadDesignSystemDocument /
// getDesignProfileDistillation -> the Task 6 e2e-fake harness, with
// isRoomFakeEnabled() reading real env vars the way it does in production.
// This mirrors the fake-backend's own coverage of the same pipeline in
// e2e-fake.test.ts's "fake design profile distillation" describe block, but
// exercised through the real component tree instead of calling the fake
// functions directly.

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom's Blob (which File extends) implements only slice/size/type in this
// project's jsdom version -- arrayBuffer() is absent, unlike a real browser.
// DesignSystemBanner's upload path calls file.arrayBuffer(), so this test
// needs it; FileReader.readAsArrayBuffer is the one jsdom does implement, so
// it backs the polyfill (see user-flow-trial-canvas.test.tsx's identical
// note).
if (typeof Blob !== "undefined" && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

const mocks = vi.hoisted(() => ({
  requestCanvasSession: vi.fn(),
  useSync: vi.fn(),
  tldrawProps: null as Record<string, unknown> | null,
  routerPush: vi.fn(),
  seedDesignScreensFromFlow: vi.fn(),
  cookies: vi.fn(),
  currentUserId: "",
  currentUserEmail: "",
  currentUserName: "",
}));

vi.mock("next/navigation", () => {
  const router = { push: mocks.routerPush };
  return { useRouter: () => router };
});

vi.mock("./canvas-session", async () => {
  const actual = await vi.importActual<typeof import("./canvas-session")>("./canvas-session");
  return { ...actual, requestCanvasSession: mocks.requestCanvasSession };
});

vi.mock("@tldraw/sync", () => ({
  useSync: mocks.useSync,
}));

vi.mock("./use-user-flow-generation", () => ({
  useUserFlowGeneration: () => ({
    status: "idle",
    taskId: null,
    message: null,
    start: vi.fn(),
  }),
}));

vi.mock("./user-flow-generation", () => ({
  markUserFlowGenerationApplied: vi.fn(),
}));

vi.mock("./screen-frame-overlay", () => ({
  ScreenFrameOverlay: () => <p data-testid="mock-screen-frame-overlay">overlay</p>,
}));

vi.mock("@/features/design/components/screen-composer", () => ({
  ScreenComposer: () => <p data-testid="mock-screen-composer">composer</p>,
}));

vi.mock("@/features/design/seed-design-screens", () => ({
  seedDesignScreensFromFlow: mocks.seedDesignScreensFromFlow,
}));

vi.mock("tldraw", () => ({
  computed: (_name: string, fn: () => unknown) => ({ get: fn }),
  createUserId: (value: string) => `user:${value}`,
  getIndexAbove: () => "a2",
  getIndicesAbove: (_index: unknown, count: number) =>
    Array.from({ length: count }, (_, index) => `a${index + 1}`),
  inlineBase64AssetStore: {},
  UserRecordType: { create: (value: unknown) => value },
  useValue: (_name: string, fn: () => unknown) => fn(),
  Tldraw: (props: Record<string, unknown>) => {
    mocks.tldrawProps = props;
    return <p data-testid="mock-tldraw">canvas</p>;
  },
}));

// Backs the Task 6 fake harness's own auth: it reads the current e2e user
// off cookies (see e2e-fake.test.ts's identical setup), which is how
// requireEditor resolves the fake room's participant.
vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

import { UserFlowTrialCanvas } from "./user-flow-trial-canvas";
import { fakeCreateWorkspace } from "@/features/workspaces/e2e-fake";
import { fakeCreateRoom, fakeListRoomTaskStatuses } from "@/features/rooms/e2e-fake";

beforeEach(() => {
  vi.stubEnv("MELD_E2E_FAKE_WORKSPACES", "true");
  vi.stubEnv("MELD_E2E_FAKE_DISCOVERY", "true");
  mocks.currentUserId = "10000000-0000-4000-8000-000000000001";
  mocks.currentUserEmail = "owner@example.com";
  mocks.currentUserName = "Owner Example";
  mocks.cookies.mockImplementation(async () => ({
    get(name: string) {
      const values: Record<string, string> = {
        "meld-e2e-user-id": mocks.currentUserId,
        "meld-e2e-user-email": mocks.currentUserEmail,
        "meld-e2e-user-name": mocks.currentUserName,
      };
      const value = values[name];
      return value ? { value } : undefined;
    },
  }));
  mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
  mocks.requestCanvasSession.mockResolvedValue({
    ticket: "ticket",
    gatewayUrl: "wss://gateway.example",
    access: "edit" as const,
    expiresAt: 100,
  });
  mocks.seedDesignScreensFromFlow.mockResolvedValue([]);
  process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY = "trial-license";
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;
});

describe("Canvas design-system banner (full-stack fake harness)", () => {
  it("drives banner -> upload -> distilling -> resolved -> banner gone through the real fake pipeline", async () => {
    const workspace = await fakeCreateWorkspace({
      name: "Distillation workspace",
      projectName: "Distillation project",
    });
    const room = await fakeCreateRoom({
      workspaceId: workspace.workspaceId,
      projectId: workspace.projectId,
      name: "Distillation room",
    });

    render(
      <UserFlowTrialCanvas
        workspaceId={workspace.workspaceId}
        roomId={room.id}
        userId={mocks.currentUserId}
        userName={mocks.currentUserName}
        access="edit"
        trialEnabled={false}
      />,
    );

    // The banner mounts alongside the composer, behind the rail's "Agents"
    // item.
    fireEvent.click(screen.getByRole("button", { name: "Agents" }));

    // getActiveDesignProfile resolves false for a fresh workspace -- the
    // banner mounts through the real reader -> fake harness round trip.
    expect(await screen.findByTestId("design-system-banner")).toBeInTheDocument();
    expect(screen.getByText(/upload one to style generated screens/i)).toBeInTheDocument();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["Primary color is #112233."], "brand.md", {
      type: "text/plain",
    });

    // One continuous fake-timers session for the whole polling sequence: the
    // poll's setTimeout is scheduled *while* fake timers are active (inside
    // upload(), below), and vi.useRealTimers() drops any fake timer that's
    // still pending rather than carrying it over -- so switching back and
    // forth mid-sequence would silently strand the poll forever. Only
    // fakeListRoomTaskStatuses (a plain async call, no timers involved) needs
    // to interleave with it.
    vi.useFakeTimers();
    try {
      fireEvent.change(input, { target: { files: [file] } });
      // jsdom's FileReader (behind the Blob.arrayBuffer polyfill) schedules
      // its onload via a real 0ms timer; advanceTimersByTimeAsync(0) is a
      // no-op against a timer scheduled at "now", so step forward first to
      // flush the arrayBuffer() read, uploadDesignSystemDocument(), and the
      // fake's own queuing of the distillation task.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      expect(screen.getByText(/distilling your design system/i)).toBeInTheDocument();

      // Nothing advances the fake task's queued -> running -> completed
      // states on its own -- in the real app, some other poller on the page
      // (the room's task-status banner) calls fakeListRoomTaskStatuses as a
      // side effect. Stand in for that here, exactly as e2e-fake.test.ts's
      // own "fake design profile distillation" test does.
      await fakeListRoomTaskStatuses(room.id); // queued -> running

      // Let the hook's next poll observe "running" (still no version).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(screen.getByText(/distilling your design system/i)).toBeInTheDocument();

      await fakeListRoomTaskStatuses(room.id); // running -> completed, materializes a version

      // The hook's next poll observes the materialized version and resolves.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
    } finally {
      vi.useRealTimers();
    }

    // The version materialized; the hook resolved and Canvas's onResolved
    // flipped hasActiveDesignProfile, unmounting the banner for good.
    expect(screen.queryByTestId("design-system-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("mock-screen-composer")).toBeInTheDocument();
  });
});
