// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NoProjectsEmptyState } from "./no-projects-empty-state";

afterEach(cleanup);

// A Workspace whose only Project has been deleted used to render a heading and
// "You're all caught up" and nothing else -- no route forward for an admin and
// no explanation for a member.
it("explains why there is nothing to start and who can fix it", () => {
  render(<NoProjectsEmptyState />);

  expect(screen.getByText("No projects yet")).toBeVisible();
  expect(
    screen.getByText(/A workspace administrator can create the first one/),
  ).toBeVisible();
});
