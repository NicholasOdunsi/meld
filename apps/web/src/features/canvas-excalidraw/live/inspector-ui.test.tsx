// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Type } from "lucide-react";
import { AutoIcon, ColourRow, SelectField, Section, TextField } from "./inspector-ui";
import { INSPECTOR_CSS } from "./inspector-theme";
import { escapeAction, isInsidePopup } from "./selection-rules";
afterEach(cleanup);

const OPTIONS = [
  { value: "sans", label: "Sans" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Mono" },
] as const;

describe("Section", () => {
  it("collapses and expands its children from the title row", () => {
    render(<Section title="Typography"><p>inside</p></Section>);
    const toggle = screen.getByRole("button", { name: "Typography section" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("inside")).toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("inside")).not.toBeVisible();
    fireEvent.click(toggle);
    expect(screen.getByText("inside")).toBeVisible();
  });
  it("keeps collapsed children mounted so typed text survives, and can start collapsed", () => {
    render(<Section title="Layout" defaultOpen={false}><input aria-label="kept" defaultValue="x" /></Section>);
    expect(screen.getByRole("button", { name: "Layout section" })).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector("input")).not.toBeNull();
    expect(screen.queryByRole("textbox", { name: "kept" })).toBeNull(); // hidden from the accessibility tree
  });
});

describe("TextField", () => {
  function setup(props: Partial<Parameters<typeof TextField>[0]> = {}) {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<TextField ariaLabel="Padding" value="8" onChange={onChange} onCommit={onCommit} {...props} />);
    return { onChange, onCommit, input: screen.getByRole("textbox", { name: "Padding" }) };
  }
  it("reports typing and commits on Enter and on blur", () => {
    const { onChange, onCommit, input } = setup();
    fireEvent.change(input, { target: { value: "9" } });
    expect(onChange).toHaveBeenCalledWith("9");
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledTimes(1);
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(2);
  });
  it("hands other keys to onKeyDown but keeps Enter for the commit", () => {
    const onKeyDown = vi.fn();
    const { input, onCommit } = setup({ onKeyDown });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
  it("shows the invalid state and the disabled state", () => {
    const { input } = setup({ invalid: true, disabled: true, inputMode: "numeric" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute("inputmode", "numeric");
  });
  it("draws an inline icon or letter inside the field, not outside it", () => {
    const { input } = setup({ icon: <Type />, label: "W", trailing: <AutoIcon /> });
    const root = input.closest(".orion-i-field")!;
    expect(root).toContainElement(screen.getByTitle("Auto size"));
    expect(root).toHaveTextContent("W");
    expect(root.querySelector("svg")).not.toBeNull();
  });
});

describe("SelectField", () => {
  function setup(props: Partial<Parameters<typeof SelectField>[0]> = {}) {
    const onChange = vi.fn();
    render(<SelectField ariaLabel="Font" value="sans" options={OPTIONS} onChange={onChange} {...props} />);
    return { onChange, trigger: screen.getByRole("combobox", { name: "Font" }) };
  }
  it("shows the chosen label and the muted trailing text inside the row", () => {
    const { trigger } = setup({ trailingText: "DM Sans" });
    expect(trigger).toHaveTextContent("Sans");
    expect(trigger).toHaveTextContent("DM Sans");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
  it("opens a listbox on click, picks with a click and closes", () => {
    const { trigger, onChange } = setup();
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox", { name: "Font" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Sans" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("option", { name: "Serif" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("serif");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it("opens with ArrowDown or Enter, moves with the arrows and picks with Enter", () => {
    const { trigger, onChange } = setup();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const list = screen.getByRole("listbox");
    expect(document.activeElement).toBe(list);
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "ArrowDown" }); // clamps at the last option
    fireEvent.keyDown(list, { key: "ArrowUp" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(onChange).toHaveBeenCalledExactlyOnceWith("serif");
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });
  it("moves focus into the list when it opens, while the list can take focus (never visibility:hidden)", () => {
    const focused: { role: string | null; visibility: string; display: string }[] = [];
    const original = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function focus(this: HTMLElement, ...args: Parameters<HTMLElement["focus"]>) {
      const style = getComputedStyle(this);
      focused.push({ role: this.getAttribute("role"), visibility: style.visibility, display: style.display });
      return original.apply(this, args);
    };
    try {
      const { trigger } = setup();
      fireEvent.keyDown(trigger, { key: "ArrowDown" });
    } finally {
      HTMLElement.prototype.focus = original;
    }
    const onList = focused.filter((call) => call.role === "listbox");
    expect(onList.length).toBeGreaterThan(0);
    for (const call of onList) {
      expect(call.visibility).not.toBe("hidden");
      expect(call.display).not.toBe("none");
    }
    expect(document.activeElement).toBe(screen.getByRole("listbox"));
    // The unplaced list hides with opacity only, from the theme's rule (a stylesheet rule, so not visibility).
    expect(INSPECTOR_CSS).toMatch(/\.orion-i-menu:not\(\[data-placed\]\)\{opacity:0\}/);
    expect(INSPECTOR_CSS).not.toMatch(/\.orion-i-menu[^{]*\{[^}]*visibility:hidden/);
  });
  it("closes only the list on Escape: the event comes from inside a popup, so the board leaves it alone", () => {
    const { trigger, onChange } = setup();
    const seen: { inside: boolean; action: string }[] = [];
    const spy = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        seen.push({
          inside: isInsidePopup(event.target),
          action: escapeAction({ hasPick: true, targetInsidePopup: isInsidePopup(event.target), edit: true }),
        });
      }
    };
    document.addEventListener("keydown", spy, true);
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    document.removeEventListener("keydown", spy, true);
    expect(seen).toEqual([{ inside: true, action: "ignore" }]);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });
  it("closes on a press outside, and does not open while disabled", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
    cleanup();
    const disabled = setup({ disabled: true });
    expect(disabled.trigger).toBeDisabled();
    fireEvent.click(disabled.trigger);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("ColourRow", () => {
  it("opens the colour popup and picks a swatch", () => {
    const onChange = vi.fn();
    render(<ColourRow ariaLabel="Background colour" value="#123456" used={["#abcdef"]} onChange={onChange} />);
    const row = screen.getByRole("button", { name: "Background colour" });
    expect(row).toHaveTextContent("123456");
    fireEvent.click(row);
    expect(screen.getByText("Used on this screen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "#abcdef" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("#abcdef");
  });
  it("is disabled as a whole when the colour is code-owned", () => {
    render(<ColourRow ariaLabel="Text colour" value={null} used={[]} disabled onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Text colour" })).toBeDisabled();
  });
});

describe("shared look", () => {
  it("gives every kind of field the same root class, so height, background and radius cannot drift", () => {
    render(
      <>
        <TextField ariaLabel="Text" value="" onChange={vi.fn()} onCommit={vi.fn()} />
        <SelectField ariaLabel="Font" value="sans" options={OPTIONS} onChange={vi.fn()} />
        <ColourRow ariaLabel="Text colour" value="#111111" used={[]} onChange={vi.fn()} />
      </>,
    );
    const roots = [
      screen.getByRole("textbox", { name: "Text" }).closest(".orion-i-field"),
      screen.getByRole("combobox", { name: "Font" }).closest(".orion-i-field"),
      screen.getByRole("button", { name: "Text colour" }).closest(".orion-i-field"),
    ];
    for (const root of roots) expect(root).not.toBeNull();
    expect(new Set(roots.map((root) => root!.className.split(" ").filter((name) => name.startsWith("orion-i-field")).join(" "))).size).toBe(1);
    // ...and that one class takes its height, background, radius and padding from the shared variables only.
    const rule = /^\.orion-i-field\{([^}]*)\}/m.exec(INSPECTOR_CSS)?.[1] ?? "";
    expect(rule).toContain("height:var(--orion-i-field-h)");
    expect(rule).toContain("background:var(--orion-i-field-bg)");
    expect(rule).toContain("border-radius:var(--orion-i-field-radius)");
    expect(rule).toContain("padding:var(--orion-i-field-pad)");
    expect(rule).not.toMatch(/#[0-9a-f]{3,8}\b|\d+(?:\.\d+)?px/i);
    // No variant rule re-declares them for a kind of field.
    expect(INSPECTOR_CSS.match(/^\.orion-i-field[^{,]*\{[^}]*(?:height|background|border-radius):/gm)).toHaveLength(1);
  });
  it("lets a colour row fill its row like the other fields, even though the popover wraps it in an inline anchor", () => {
    // Equal columns (grid), and the popover's wrapper, which holds the field, is stretched to the full column.
    expect(INSPECTOR_CSS).toMatch(/\.orion-i-row\{[^}]*grid-auto-columns:minmax\(0,1fr\)/);
    expect(INSPECTOR_CSS).toMatch(/\.orion-i-row>:has\(>\.orion-i-field\)\{[^}]*display:flex[^}]*width:100%/);
  });
});
