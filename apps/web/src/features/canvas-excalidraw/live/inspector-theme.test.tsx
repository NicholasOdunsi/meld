// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { INSPECTOR_CLASS, MENU_LAYOUT, INSPECTOR_CSS, INSPECTOR_VARS, InspectorThemeStyle } from "./inspector-theme";

afterEach(cleanup);

describe("inspector theme", () => {
  it("carries the mock's pill and dock values as variables on the inspector class", () => {
    expect(INSPECTOR_VARS["--orion-i-surface"]).toBe("#262626");
    expect(INSPECTOR_VARS["--orion-i-border"]).toBe("1px solid #3a3a3a");
    expect(INSPECTOR_VARS["--orion-i-shadow"]).toBe("0 8px 24px rgba(0, 0, 0, 0.5)");
    expect(INSPECTOR_VARS["--orion-i-pill-radius"]).toBe("16px");
    expect(INSPECTOR_VARS["--orion-i-pill-btn"]).toBe("34px");
    expect(INSPECTOR_VARS["--orion-i-btn-radius"]).toBe("10px");
    expect(INSPECTOR_VARS["--orion-i-btn-active-bg"]).toBe("#e8e8e8");
    expect(INSPECTOR_VARS["--orion-i-btn-disabled-fg"]).toBe("#6b6b6b");
    expect(INSPECTOR_VARS["--orion-i-divider"]).toBe("#3d3d3d");
    expect(INSPECTOR_VARS["--orion-i-dock-radius"]).toBe("18px");
    expect(INSPECTOR_CSS).toContain(`.${INSPECTOR_CLASS},`);
  });
  it("carries the mock's field and section values, one look for every kind of field", () => {
    expect(INSPECTOR_VARS["--orion-i-field-h"]).toBe("34px");
    expect(INSPECTOR_VARS["--orion-i-field-radius"]).toBe("9px");
    expect(INSPECTOR_VARS["--orion-i-field-bg"]).toBe("#2a2a2a");
    expect(INSPECTOR_VARS["--orion-i-field-fg"]).toBe("#ececec");
    expect(INSPECTOR_VARS["--orion-i-field-label"]).toBe("#8c8c8c");
    expect(INSPECTOR_VARS["--orion-i-field-muted"]).toBe("#7f7f7f");
    expect(INSPECTOR_VARS["--orion-i-panel-bg"]).toBe("#1c1c1c");
    expect(INSPECTOR_VARS["--orion-i-panel-divider"]).toBe("#2a2a2a");
    expect(INSPECTOR_VARS["--orion-i-section-fg"]).toBe("#e4e4e4");
    expect(INSPECTOR_VARS["--orion-i-section-size"]).toBe("12.5px");
    expect(INSPECTOR_VARS["--orion-i-section-weight"]).toBe("600");
    expect(INSPECTOR_VARS["--orion-i-section-chevron"]).toBe("#8a8a8a");
    // The sheet itself only references the variables for these: no literal colours outside the :root block.
    const rules = INSPECTOR_CSS.split("\n").filter((line) => line.startsWith(".orion-i-") || line.startsWith(".orion-pill"));
    for (const rule of rules) expect(rule).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    // The dropdown list is portalled to <body>, so it carries the scope class that gets the variables.
    expect(INSPECTOR_CSS).toContain(".orion-i-scope,");
  });
  it("feeds the dropdown's size and gap from one place, for the sheet and the placement maths", () => {
    expect(INSPECTOR_VARS["--orion-i-menu-max-h"]).toBe(`${MENU_LAYOUT.maxHeight}px`);
    expect(INSPECTOR_VARS["--orion-i-menu-gap"]).toBe(`${MENU_LAYOUT.gap}px`);
  });
  it("renders one style element, the same on the server and the client", () => {
    const { container } = render(<InspectorThemeStyle />);
    expect(container.querySelectorAll("style[data-orion-inspector-theme]")).toHaveLength(1);
    expect(renderToString(<InspectorThemeStyle />)).toContain("--orion-i-surface:#262626");
  });
  it("is the only place literal colours live: the dock stylesheet only references the variables", () => {
    const css = readFileSync(join(__dirname, "../chrome/orion-board.css"), "utf8");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).toContain("var(--orion-i-surface)");
  });
});
