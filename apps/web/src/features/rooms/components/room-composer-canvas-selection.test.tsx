// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  RoomComposerProvider,
  useRoomComposerContext,
  type RoomComposerContextValue,
} from "./room-composer-context";

afterEach(cleanup);

function Probe() {
  const context = useRoomComposerContext();
  return (
    <p data-testid="probe">
      {(context?.canvasSelection ?? [])
        .map((entry) => entry.targetScreenId ?? "new")
        .join(",") || "none"}
    </p>
  );
}

describe("canvas selection reaches the one composer", () => {
  // The Canvas composer is gone; the dock composer is the only one left. It
  // needs what that composer had -- which screens the person has selected --
  // or every request is a brand-new screen and nothing can ever be edited.
  // This rides the same context that already carries a PRD text selection.
  function renderWith(canvasSelection: RoomComposerContextValue["canvasSelection"]) {
    render(
      <RoomComposerProvider
        value={{
          prdSelection: null,
          addPrdSelection: () => {},
          clearPrdSelection: () => {},
          canvasSelection,
          setCanvasSelection: () => {},
          canvasScreenNames: new Map(),
          setCanvasScreenNames: () => {},
        }}
      >
        <Probe />
      </RoomComposerProvider>,
    );
  }

  it("carries the selected screens through to the composer", () => {
    renderWith([
      { targetScreenId: "screen-a", sketchShapes: [], frame: { x: 0, y: 0, w: 10, h: 10 } },
      { targetScreenId: "screen-b", sketchShapes: [], frame: { x: 0, y: 0, w: 10, h: 10 } },
    ]);
    expect(screen.getByTestId("probe")).toHaveTextContent("screen-a,screen-b");
  });

  it("reports nothing selected as an empty selection, not undefined", () => {
    renderWith([]);
    expect(screen.getByTestId("probe")).toHaveTextContent("none");
  });
});
