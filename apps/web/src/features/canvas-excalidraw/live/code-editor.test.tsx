// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import {
  CodeEditor,
  createFileEditor,
  syncIssues,
  syncSource,
} from "./code-editor";
afterEach(cleanup);
const source = {
  kind: "react" as const,
  entry: "App.tsx",
  files: {
    "App.tsx": "const view = <b>hello</b>;",
    "other.css": "b {color:red}",
  },
};
it("sends user edits exactly once and external replacements without feedback", () => {
  const parent = document.createElement("section");
  document.body.append(parent);
  const change = vi.fn(),
    undo = vi.fn();
  const view = createFileEditor(parent, "App.tsx", "hello", {
    editable: true,
    change,
    undo,
    redo: vi.fn(),
  });
  view.dispatch({ changes: { from: 0, to: 5, insert: "new" } });
  expect(change).toHaveBeenCalledExactlyOnceWith("new");
  syncSource(view, "external");
  expect(change).toHaveBeenCalledTimes(1);
  syncIssues(view, "App.tsx", [
    { file: "App.tsx", message: "broken", line: 1, column: 200 },
  ]);
  expect(view.state.doc.toString()).toBe("external");
  fireEvent.keyDown(view.contentDOM, { key: "z", ctrlKey: true });
  expect(undo).toHaveBeenCalledOnce();
  view.destroy();
  parent.remove();
});
it("retains editor DOM and selection across acknowledgements and diagnostics", () => {
  const props = { source, onChange: vi.fn() };
  const { rerender } = render(<CodeEditor {...props} />);
  const content = screen.getByRole("textbox", { name: "Source for App.tsx" });
  const view = EditorView.findFromDOM(content)!;
  view.dispatch({ selection: { anchor: 4 } });
  rerender(
    <CodeEditor
      {...props}
      source={{ ...source, files: { ...source.files } }}
      issues={[{ file: "App.tsx", message: "invalid", line: 1, column: 4 }]}
    />,
  );
  expect(screen.getByRole("textbox", { name: "Source for App.tsx" })).toBe(
    content,
  );
  expect(view.state.selection.main.anchor).toBe(4);
  expect(screen.getByText("1:5 invalid")).toBeInTheDocument();
});
it("switches source tabs and restores each cursor with read-only controls", () => {
  render(<CodeEditor source={source} onChange={vi.fn()} readOnly />);
  const content = screen.getByRole("textbox", { name: "Source for App.tsx" });
  const view = EditorView.findFromDOM(content)!;
  view.dispatch({ selection: { anchor: 3 } });
  fireEvent.click(screen.getByRole("button", { name: "other.css" }));
  expect(
    screen.getByRole("textbox", { name: "Source for other.css" }),
  ).toHaveAttribute("contenteditable", "false");
  fireEvent.click(screen.getByRole("button", { name: "App.tsx" }));
  expect(
    EditorView.findFromDOM(
      screen.getByRole("textbox", { name: "Source for App.tsx" }),
    )!.state.selection.main.anchor,
  ).toBe(3);
  expect(screen.getByRole("button", { name: "Copy" })).toBeEnabled();
});

it("shows an export error with a working retry for the active file", async () => {
  const writeText = vi
    .fn()
    .mockRejectedValueOnce(new Error("Clipboard denied"))
    .mockResolvedValueOnce(undefined);
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  try {
    render(<CodeEditor source={source} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "other.css" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText("Clipboard denied")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(writeText).toHaveBeenLastCalledWith(source.files["other.css"]);
  } finally {
    if (original) Object.defineProperty(navigator, "clipboard", original);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});

it("shows line numbers, tabs only for several files, and compact diagnostics with positions", () => {
  const single = { ...source, files: { "App.tsx": "a\nb" } };
  const { container, rerender } = render(
    <CodeEditor source={single} onChange={vi.fn()} dark />,
  );
  expect(container.querySelector(".cm-lineNumbers")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "other.css" })).toBeNull();
  rerender(
    <CodeEditor
      source={source}
      onChange={vi.fn()}
      dark={false}
      issues={[{ file: "other.css", message: "bad rule", line: 3, column: 0 }]}
    />,
  );
  expect(screen.getByRole("button", { name: "other.css" })).toBeInTheDocument();
  expect(screen.getByText("3:1 bad rule")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
});

it("has no Undo/Redo buttons but keeps the keyboard shortcuts, off when read-only", () => {
  const onUndo = vi.fn(),
    onRedo = vi.fn();
  const { rerender } = render(
    <CodeEditor
      source={source}
      onChange={vi.fn()}
      onUndo={onUndo}
      onRedo={onRedo}
    />,
  );
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Redo" })).toBeNull();
  const content = screen.getByRole("textbox", { name: "Source for App.tsx" });
  fireEvent.keyDown(content, { key: "z", ctrlKey: true });
  expect(onUndo).toHaveBeenCalledOnce();
  fireEvent.keyDown(content, {
    key: "Z",
    keyCode: 90,
    ctrlKey: true,
    shiftKey: true,
  });
  expect(onRedo).toHaveBeenCalledOnce();
  rerender(
    <CodeEditor
      source={source}
      onChange={vi.fn()}
      onUndo={onUndo}
      onRedo={onRedo}
      readOnly
    />,
  );
  fireEvent.keyDown(content, { key: "z", ctrlKey: true });
  fireEvent.keyDown(content, {
    key: "Z",
    keyCode: 90,
    ctrlKey: true,
    shiftKey: true,
  });
  expect(onUndo).toHaveBeenCalledOnce();
  expect(onRedo).toHaveBeenCalledOnce();
});

it("has a slim top bar: Copy and Download as 30px icon buttons, and the file path when there is one file", () => {
  const single = { ...source, files: { "App.tsx": "a" } };
  const { container } = render(<CodeEditor source={single} onChange={vi.fn()} />);
  const bar = container.querySelector(".orion-code__bar") as HTMLElement;
  expect(bar).not.toBeNull();
  expect(bar).toHaveTextContent("App.tsx");
  expect(bar.querySelector(".orion-seg")).toBeNull();
  for (const name of ["Copy", "Download"]) {
    const button = screen.getByRole("button", { name });
    expect(bar).toContainElement(button);
    expect(button).toHaveClass("orion-i-iconbtn");
    expect(button).toHaveAttribute("title", name);
  }
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Redo" })).toBeNull();
});

it("shows several files as small pills in the segmented style, the current one pressed", () => {
  const { container } = render(<CodeEditor source={source} onChange={vi.fn()} />);
  const group = container.querySelector(".orion-code__bar .orion-seg") as HTMLElement;
  expect(group).toHaveClass("orion-seg--small");
  expect(group).toHaveAttribute("role", "group");
  const pills = within(group).getAllByRole("button");
  expect(pills.map((pill) => pill.textContent)).toEqual(["App.tsx", "other.css"]);
  for (const pill of pills) expect(pill).toHaveClass("orion-seg__tab");
  expect(pills[0]).toHaveAttribute("aria-pressed", "true");
  expect(pills[1]).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(pills[1]);
  expect(screen.getByRole("button", { name: "other.css" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "App.tsx" })).toHaveAttribute("aria-pressed", "false");
});

it("lists diagnostics in the quiet mono list, with the file under the message", () => {
  const { container } = render(
    <CodeEditor source={source} onChange={vi.fn()} issues={[{ file: "other.css", message: "bad rule", line: 3, column: 0 }, { file: "App.tsx", message: "no position" }]} />,
  );
  const list = container.querySelector("ul.orion-code__issues") as HTMLElement;
  expect(list).not.toBeNull();
  const items = within(list).getAllByRole("listitem");
  expect(items).toHaveLength(2);
  expect(items[0]).toHaveTextContent("3:1 bad rule");
  expect(items[0]).toHaveTextContent("other.css");
  expect(within(items[1]).getByText("no position")).toBeInTheDocument();
});

it("leaves Cmd/Ctrl+Z to the editor inside .cm-editor and hosts it in the rounded host", () => {
  const onUndo = vi.fn();
  const { container } = render(<CodeEditor source={source} onChange={vi.fn()} onUndo={onUndo} />);
  expect(container.querySelector(".orion-code__host .cm-editor")).not.toBeNull();
  fireEvent.keyDown(container.querySelector(".cm-content")!, { key: "z", ctrlKey: true });
  expect(onUndo).toHaveBeenCalledOnce();
});
