// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Layout } from "@astryxdesign/core/Layout";
import { codeLanguageFor, LiveCodeView, LivePanel } from "./live-panel";

afterEach(cleanup);

const source = { kind: "react" as const, files: { "App.tsx": "export default function App() { return <main>Hi</main>; }", "styles.css": "main { display: grid; }" }, entry: "App.tsx" };

describe("LivePanel", () => {
  it("shows its content without a tab list while there is one tab, and closes", async () => {
    const onClose = vi.fn();
    render(<Layout end={<LivePanel title="Screen code" tab="code" tabs={[{value:"code",label:"Code"}]} onTabChange={vi.fn()} onClose={onClose}><p>body</p></LivePanel>} />);
    expect(screen.getByText("Screen code")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Tabs" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows the default Tweak and Code tabs", async () => {
    const onTabChange = vi.fn();
    render(<Layout end={(
      <LivePanel title="Screen" tab="code" onTabChange={onTabChange} onClose={vi.fn()}><p>body</p></LivePanel>
    )} />);
    expect(screen.getByRole("navigation", { name: "Tabs" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tweak" }));
    expect(onTabChange).toHaveBeenCalledWith("tweak");
  });
});

describe("LivePanel history", () => {
  const history = (over: Partial<{ canUndo: boolean; canRedo: boolean }> = {}) => ({ canUndo: true, canRedo: true, onUndo: vi.fn(), onRedo: vi.fn(), ...over });
  it("renders Undo, Redo and Close in order, and disables Undo when it cannot undo", async () => {
    const h = history({ canUndo: false });
    render(<Layout end={<LivePanel title="Screen" tab="tweak" onTabChange={vi.fn()} onClose={vi.fn()} history={h}><p>body</p></LivePanel>} />);
    const header = screen.getByTestId("live-panel").firstElementChild as HTMLElement;
    const names = Array.from(header.querySelectorAll("button")).map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(names).toEqual(["Undo", "Redo", "Close"]);
    expect(screen.getByRole("button", { name: "Undo" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Redo" })).not.toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(h.onRedo).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(h.onUndo).not.toHaveBeenCalled();
  });
  it("renders no Undo or Redo without history", () => {
    render(<Layout end={<LivePanel title="Screen" tab="code" onTabChange={vi.fn()} onClose={vi.fn()}><p>body</p></LivePanel>} />);
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Redo" })).toBeNull();
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
