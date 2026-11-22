// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { INSPECTOR_CLASS, INSPECTOR_CSS, INSPECTOR_VARS, InspectorThemeStyle } from "./inspector-theme";

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
