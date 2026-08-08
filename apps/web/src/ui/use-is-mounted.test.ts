// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useIsMounted } from "./use-is-mounted";

it("reports mounted once rendered on the client", () => {
  // jsdom has no real SSR pass, so useSyncExternalStore resolves its client
  // snapshot immediately. This proves the hook returns the client value --
  // not that it survives an actual hydration boundary, which only the
  // browser can exercise.
  const { result } = renderHook(() => useIsMounted());

  expect(result.current).toBe(true);
});
