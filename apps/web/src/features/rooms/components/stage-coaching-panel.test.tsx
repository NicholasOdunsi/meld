// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { StageReadinessSignals } from "../stage-readiness";

const actions = vi.hoisted(() => ({
  setRoomChecklistItem: vi.fn().mockResolvedValue(true),
  setRoomStage: vi.fn().mockResolvedValue("design"),
}));
const refresh = vi.hoisted(() => vi.fn());

vi.mock("../actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@astryxdesign/core/Toast", () => ({ useToast: () => vi.fn() }));
// The realtime hook only supplies the live stage; under the poll mode the panel
// uses here it is disabled anyway, so echo the initial rooms back.
vi.mock("../use-room-lifecycle-realtime", () => ({
  useRoomLifecycleRealtime: (
    _scope: unknown,
    initialRooms: unknown[],
  ) => initialRooms,
}));

import { StageCoachingPanel } from "./stage-coaching-panel";

const IDS = {
  room: "40000000-0000-4000-8000-000000000001",
  workspace: "20000000-0000-4000-8000-000000000001",
  project: "70000000-0000-4000-8000-000000000001",
  owner: "10000000-0000-4000-8000-000000000001",
};

function signals(
  overrides: Partial<StageReadinessSignals> = {},
): StageReadinessSignals {
  return {
    participantCount: 1,
    hasHumanMessage: false,
    hasAgentReply: false,
    hasPrd: false,
    prdStatus: null,
    userFlowCount: 0,
    decisionCount: 0,
    designAssetCount: 0,
    manualChecks: { problem_framed: false, design_reviewed: false },
    builtScreenCount: 0,
    designReferenceCount: 0,
    hasDesignProfile: false,
    designReviewedAt: null,
    latestDesignRevisionAt: null,
    ...overrides,
  };
}

function renderPanel(props: {
  stage: "discovery" | "define" | "design" | "development";
  stageReadiness: StageReadinessSignals;
  canEditChecklist?: boolean;
  canChangeStage?: boolean;
}) {
  return render(
    <StageCoachingPanel
      roomId={IDS.room}
      workspaceId={IDS.workspace}
      projectId={IDS.project}
      roomName="Customer interviews"
      ownerId={IDS.owner}
      stage={props.stage}
      updatedAt="2026-08-10T09:00:00.000Z"
      stageReadiness={props.stageReadiness}
      canEditChecklist={props.canEditChecklist ?? true}
      canChangeStage={props.canChangeStage ?? true}
      realtimeMode="development-poll"
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("collapses to a pill showing the stage and readiness fraction", () => {
  renderPanel({
    stage: "define",
    stageReadiness: signals({
      hasPrd: true,
      userFlowCount: 1,
      decisionCount: 2,
      prdStatus: "draft",
    }),
  });
  const pill = screen.getByTestId("stage-coaching-pill");
  expect(pill).toHaveTextContent("Define");
  // PRD drafted + user journey + decisions done, acceptance still pending.
  expect(pill).toHaveTextContent("3 / 4");
});

it("opens by default to the checklist and a plain move button", () => {
  renderPanel({
    stage: "define",
    stageReadiness: signals({
      hasPrd: true,
      userFlowCount: 1,
      decisionCount: 2,
      prdStatus: "draft",
    }),
  });

  expect(screen.getByText("PRD drafted")).toBeInTheDocument();
  expect(screen.getByText("PRD accepted by the team")).toBeInTheDocument();
  const move = screen.getByRole("button", { name: /Move to Design/ });
  expect(move).toBeInTheDocument();
  // No "· N left" count and no tag pills any more.
  expect(move.textContent).not.toMatch(/left/);
  expect(screen.queryByText("Auto")).not.toBeInTheDocument();
  expect(screen.queryByText("Manual")).not.toBeInTheDocument();
});

it("collapses to just the pill when the pill is clicked", async () => {
  const user = userEvent.setup();
  renderPanel({
    stage: "define",
    stageReadiness: signals({ hasPrd: true }),
  });

  expect(screen.getByText("PRD drafted")).toBeInTheDocument();
  await user.click(screen.getByTestId("stage-coaching-pill"));
  expect(screen.queryByText("PRD drafted")).not.toBeInTheDocument();
});

it("confirms a manual item through the checklist action", async () => {
  const user = userEvent.setup();
  renderPanel({
    stage: "design",
    stageReadiness: signals({ userFlowCount: 1, designAssetCount: 2 }),
  });

  const confirm = await screen.findByRole("button", {
    name: /Confirm "Design reviewed"/,
  });
  await user.click(confirm);

  await waitFor(() => {
    expect(actions.setRoomChecklistItem).toHaveBeenCalledWith({
      roomId: IDS.room,
      itemKey: "design_reviewed",
      checked: true,
    });
  });
});

it("moves the room stage through the stage action", async () => {
  const user = userEvent.setup();
  renderPanel({
    stage: "define",
    stageReadiness: signals({
      hasPrd: true,
      userFlowCount: 1,
      decisionCount: 2,
      prdStatus: "accepted",
    }),
  });

  await user.click(
    await screen.findByRole("button", { name: /Move to Design/ }),
  );

  await waitFor(() => {
    expect(actions.setRoomStage).toHaveBeenCalledWith({
      roomId: IDS.room,
      stage: "design",
    });
  });
});

it("hides move controls from members who cannot change the stage", () => {
  renderPanel({
    stage: "define",
    stageReadiness: signals({ hasPrd: true }),
    canChangeStage: false,
  });

  expect(screen.getByText("PRD drafted")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Move to Design/ }),
  ).not.toBeInTheDocument();
});
