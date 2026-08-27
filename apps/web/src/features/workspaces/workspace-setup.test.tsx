// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reveal: vi.fn(),
}));

// The actual reveal (mascot, tips, dig-reveal field, navigation) lives in
// `WorkspaceRevealProvider` and is covered by its own test suite
// (`workspace-reveal-provider.test.tsx`). This suite only needs to confirm
// WorkspaceSetup asks for it exactly once.
vi.mock("./workspace-reveal-provider", () => ({
  useWorkspaceReveal: () => ({ reveal: mocks.reveal }),
}));

import { WorkspaceSetup } from "./workspace-setup";

const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";

beforeEach(() => {
  mocks.reveal.mockClear();
});

afterEach(cleanup);

it("reveals the workspace on mount", () => {
  render(<WorkspaceSetup workspaceId={WORKSPACE_ID} />);

  expect(mocks.reveal).toHaveBeenCalledTimes(1);
  expect(mocks.reveal).toHaveBeenCalledWith(`/${WORKSPACE_ID}`);
});

it("never asks twice, even if it re-renders", () => {
  const { rerender } = render(
    <WorkspaceSetup workspaceId={WORKSPACE_ID} />,
  );
  rerender(<WorkspaceSetup workspaceId={WORKSPACE_ID} />);

  expect(mocks.reveal).toHaveBeenCalledTimes(1);
});
