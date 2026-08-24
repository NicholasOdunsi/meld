// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { RoomProposedAction } from "@meld/contracts";
import { RoomProposalAction } from "./room-proposal-action";

afterEach(cleanup);

const messageId = "50000000-0000-4000-8000-000000000005";

function renderProposal(
  overrides: {
    action?: RoomProposedAction;
    canEdit?: boolean;
    response?: "accepted" | "dismissed" | null;
    onConfirm?: (
      messageId: string,
      action: RoomProposedAction,
    ) => Promise<void>;
    onDismiss?: (messageId: string) => Promise<void>;
    isBusy?: boolean;
  } = {},
) {
  const onConfirm = overrides.onConfirm ?? vi.fn(async () => {});
  const onDismiss = overrides.onDismiss ?? vi.fn(async () => {});
  const user = userEvent.setup();
  render(
    <RoomProposalAction
      messageId={messageId}
      action={overrides.action ?? { kind: "user_flow_generate" }}
      canEdit={overrides.canEdit ?? true}
      response={overrides.response ?? null}
      onConfirm={onConfirm}
      onDismiss={onDismiss}
      isBusy={overrides.isBusy}
    />,
  );
  return { onConfirm, onDismiss, user };
}

it("shows the exact decision summary before it is confirmed", async () => {
  const action: RoomProposedAction = {
    kind: "decision_capture",
    summary: "Keep recovery codes single-use.",
    sourceMessageId: null,
  };
  const { onConfirm, user } = renderProposal({ action });

  expect(
    screen.getByText("Keep recovery codes single-use."),
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Capture decision" }));
  expect(onConfirm).toHaveBeenCalledWith(messageId, action);
});

it("offers user flow creation to an editor", async () => {
  const { onConfirm, user } = renderProposal({
    action: { kind: "user_flow_generate" },
  });

  await user.click(screen.getByRole("button", { name: "Create user flow" }));
  expect(onConfirm).toHaveBeenCalledWith(messageId, {
    kind: "user_flow_generate",
  });
});

it("offers an explicit update command for a user flow revision", async () => {
  const { onConfirm, user } = renderProposal({
    action: { kind: "user_flow_revise" },
  });

  await user.click(screen.getByRole("button", { name: "Update user flow" }));
  expect(onConfirm).toHaveBeenCalledWith(messageId, {
    kind: "user_flow_revise",
  });
});

it("lets a view-only participant dismiss but never create a user flow", async () => {
  const { onConfirm, onDismiss, user } = renderProposal({
    action: { kind: "user_flow_generate" },
    canEdit: false,
  });

  expect(
    screen.queryByRole("button", { name: "Create user flow" }),
  ).toBeNull();

  await user.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(onDismiss).toHaveBeenCalledWith(messageId);
  expect(onConfirm).not.toHaveBeenCalled();
});

it("keeps the established PRD commands for PRD proposals", () => {
  renderProposal({ action: { kind: "prd_generate" } });
  expect(
    screen.getByRole("button", { name: "Generate PRD" }),
  ).toBeInTheDocument();

  cleanup();
  renderProposal({ action: { kind: "prd_revise" } });
  expect(
    screen.getByRole("button", { name: "Update PRD" }),
  ).toBeInTheDocument();
});

it("renders nothing once the participant has answered the proposal", () => {
  const { container } = render(
    <RoomProposalAction
      messageId={messageId}
      action={{ kind: "user_flow_generate" }}
      canEdit
      response="dismissed"
      onConfirm={vi.fn(async () => {})}
      onDismiss={vi.fn(async () => {})}
    />,
  );

  expect(container).toBeEmptyDOMElement();
});

it("disables both commands while the first request is still running", async () => {
  let settleConfirm: (() => void) | undefined;
  const onConfirm = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        settleConfirm = () => resolve();
      }),
  );
  const { user } = renderProposal({
    action: { kind: "user_flow_generate" },
    onConfirm,
  });

  const create = screen.getByRole("button", { name: "Create user flow" });
  await user.click(create);
  await user.click(create);

  expect(onConfirm).toHaveBeenCalledOnce();
  expect(create).toBeDisabled();
  expect(screen.getByRole("button", { name: "Dismiss" })).toBeDisabled();

  settleConfirm?.();
});

it("stops offering its commands while another proposal is being answered", () => {
  renderProposal({ action: { kind: "user_flow_generate" }, isBusy: true });

  expect(screen.getByRole("button", { name: "Create user flow" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Dismiss" })).toBeDisabled();
});
