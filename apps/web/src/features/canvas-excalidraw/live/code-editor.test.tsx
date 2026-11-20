// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  expect(screen.getByText("App.tsx: invalid")).toBeInTheDocument();
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
  expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
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
