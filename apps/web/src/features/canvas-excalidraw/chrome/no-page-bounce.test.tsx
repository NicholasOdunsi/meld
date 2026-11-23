// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useNoPageBounce } from "./no-page-bounce";

afterEach(cleanup);

function Board() {
  useNoPageBounce();
  return null;
}

describe("useNoPageBounce", () => {
  it("stops the page rubber-banding while the board is mounted, then restores it", () => {
    document.documentElement.style.overscrollBehavior = "auto";
    document.body.style.overscrollBehavior = "";
    const { unmount } = render(<Board />);
    expect(document.documentElement.style.overscrollBehavior).toBe("none");
    expect(document.body.style.overscrollBehavior).toBe("none");
    unmount();
    expect(document.documentElement.style.overscrollBehavior).toBe("auto");
    expect(document.body.style.overscrollBehavior).toBe("");
  });
});
