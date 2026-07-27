// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ClientTimestamp } from "./client-timestamp";

afterEach(cleanup);

it("renders the timestamp once mounted on the client", () => {
  render(<ClientTimestamp value="2026-07-20T10:00:00.000Z" />);

  // jsdom always presents as a client environment (no real SSR pass), so
  // useSyncExternalStore resolves its client snapshot immediately -- this
  // proves the wrapper doesn't swallow the render entirely, not that it
  // survives an actual server/client hydration boundary.
  expect(screen.getByRole("time")).toBeInTheDocument();
});
