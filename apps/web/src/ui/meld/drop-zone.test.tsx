// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldDropZone } from "./drop-zone";

afterEach(cleanup);

const REGION = { columnStart: 2, columnEnd: 3, rowStart: 1, rowEnd: 3 } as const;

it("names the region it would fill", () => {
  render(
    <MeldDropZone
      region={REGION}
      label="Open PRD on the right half"
      isActive={false}
    />,
  );

  expect(
    screen.getByRole("presentation", { name: "Open PRD on the right half" }),
  ).toBeInTheDocument();
});

it("places itself on the plane's grid", () => {
  render(<MeldDropZone region={REGION} label="right half" isActive={false} />);

  expect(screen.getByTestId("drop-zone")).toHaveStyle({
    gridColumnStart: "2",
  });
});

it("reflects the active zone for stable targeting", () => {
  render(<MeldDropZone region={REGION} label="right half" isActive />);

  expect(screen.getByTestId("drop-zone")).toHaveAttribute(
    "data-active",
    "true",
  );
});

it("is inactive by default", () => {
  render(<MeldDropZone region={REGION} label="right half" isActive={false} />);

  expect(screen.getByTestId("drop-zone")).toHaveAttribute(
    "data-active",
    "false",
  );
});
