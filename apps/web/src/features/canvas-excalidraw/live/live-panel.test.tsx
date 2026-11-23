// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Layout } from "@astryxdesign/core/Layout";
import { codeLanguageFor, LiveCodeView, LivePanel } from "./live-panel";

afterEach(cleanup);

const source = { kind: "react" as const, files: { "App.tsx": "export default function App() { return <main>Hi</main>; }", "styles.css": "main { display: grid; }" }, entry: "App.tsx" };

describe("LivePanel", () => {
  it("is a column with the shell class, scrolling vertically, that carries the test id and the key handler", () => {
    const onKeyDown = vi.fn();
    render(<Layout end={<LivePanel tab="tweak" onTabChange={vi.fn()} onClose={vi.fn()} onKeyDown={onKeyDown}><p>body</p></LivePanel>} />);
    const column = screen.getByTestId("live-panel");
    expect(column).toHaveClass("orion-panel");
    fireEvent.keyDown(screen.getByText("body"), { key: "a" });
    expect(onKeyDown).toHaveBeenCalledOnce();
  });
});

describe("LivePanel header", () => {
  const header = () => screen.getByTestId("live-panel").firstElementChild as HTMLElement;

  it("holds exactly the Tweak and Code tabs and Close: no title, no Undo, Redo or Interact", () => {
    render(<Layout end={<LivePanel tab="tweak" onTabChange={vi.fn()} onClose={vi.fn()}><p>body</p></LivePanel>} />);
    const tabs = within(header()).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Tweak", "Code"]);
    expect(within(header()).getByRole("tablist")).toBeInTheDocument();
    expect(Array.from(header().querySelectorAll("button")).map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(["Tweak", "Code", "Close"]);
    expect(header().textContent).toBe("TweakCode");
    expect(screen.queryByText("Screen")).toBeNull();
    for (const name of ["Undo", "Redo", "Interact", "Edit"]) expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("marks the current tab selected and switches on a click", async () => {
    const onTabChange = vi.fn();
    render(<Layout end={<LivePanel tab="code" onTabChange={onTabChange} onClose={vi.fn()}><p>body</p></LivePanel>} />);
    expect(screen.getByRole("tab", { name: "Code" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Tweak" })).toHaveAttribute("aria-selected", "false");
    await userEvent.click(screen.getByRole("tab", { name: "Tweak" }));
    expect(onTabChange).toHaveBeenCalledWith("tweak");
  });

  it("keeps a disabled Tweak visible with its reason as title and description, and ignores clicks on it", async () => {
    const onTabChange = vi.fn();
    render(<Layout end={<LivePanel tab="code" onTabChange={onTabChange} onClose={vi.fn()} disabledTabs={{ tweak: "Select an element to tweak it." }}><p>body</p></LivePanel>} />);
    const tweak = screen.getByRole("tab", { name: "Tweak" });
    expect(tweak).toHaveAttribute("aria-disabled", "true");
    expect(tweak).toHaveAttribute("title", "Select an element to tweak it.");
    expect(tweak).toHaveAccessibleDescription("Select an element to tweak it.");
    // One roving tab stop: the selected tab only; a disabled tab is not a second stop.
    expect(tweak).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tab", { name: "Code" })).toHaveAttribute("tabindex", "0");
    await userEvent.click(tweak);
    expect(onTabChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("tab", { name: "Code" }));
    expect(onTabChange).toHaveBeenCalledWith("code");
  });

  it("never disables the tab that is current", () => {
    render(<Layout end={<LivePanel tab="tweak" onTabChange={vi.fn()} onClose={vi.fn()} disabledTabs={{ tweak: "Not now." }}><p>body</p></LivePanel>} />);
    const tweak = screen.getByRole("tab", { name: "Tweak" });
    expect(tweak).not.toHaveAttribute("aria-disabled");
    expect(tweak).not.toHaveAttribute("title");
  });

  it("moves between enabled tabs with the arrow keys", async () => {
    const onTabChange = vi.fn();
    render(<Layout end={<LivePanel tab="tweak" onTabChange={onTabChange} onClose={vi.fn()}><p>body</p></LivePanel>} />);
    screen.getByRole("tab", { name: "Tweak" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onTabChange).toHaveBeenCalledWith("code");
    expect(screen.getByRole("tab", { name: "Code" })).toHaveFocus();
  });

  it("closes from the 30px icon button named Close", async () => {
    const onClose = vi.fn();
    render(<Layout end={<LivePanel tab="tweak" onTabChange={vi.fn()} onClose={onClose}><p>body</p></LivePanel>} />);
    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toHaveClass("orion-i-iconbtn");
    await userEvent.click(close);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("LiveCodeView", () => {
  it("lists problems and shows each file", () => {
    render(<LiveCodeView source={source} issues={[{ file: "App.tsx", message: "Unsupported package: next" }, { file: null, message: "boom" }]} />);
    expect(screen.getByText("This screen has 2 problems")).toBeInTheDocument();
    expect(screen.getByText("Unsupported package: next")).toBeInTheDocument();
    expect(screen.getAllByText("App.tsx").length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain("return <main>Hi</main>");
    expect(screen.getByText(/^styles\.css/)).toBeInTheDocument();
    expect(document.body.textContent).toContain("main { display: grid; }");
  });

  it("uses singular problem copy and omits the summary when there are none", () => {
    const { rerender } = render(<LiveCodeView source={source} issues={[{ file: null, message: "boom" }]} />);
    expect(screen.getByText("This screen has a problem")).toBeInTheDocument();
    rerender(<LiveCodeView source={source} issues={[]} />);
    expect(screen.queryByText(/This screen has/)).toBeNull();
  });

  it("explains when there is no source", () => {
    render(<LiveCodeView source={null} issues={[]} />);
    expect(screen.getByText("The code for this screen isn't available.")).toBeInTheDocument();
  });

  it("picks a highlighting language from the file name", () => {
    for (const path of ["App.tsx", "utils.ts", "App.jsx", "main.js"]) {
      expect(codeLanguageFor(path)).toBe("javascript");
    }
    expect(codeLanguageFor("index.html")).toBe("html");
    expect(codeLanguageFor("index.htm")).toBe("html");
    expect(codeLanguageFor("styles.css")).toBe("css");
    expect(codeLanguageFor("notes.md")).toBe("plaintext");
  });
});
