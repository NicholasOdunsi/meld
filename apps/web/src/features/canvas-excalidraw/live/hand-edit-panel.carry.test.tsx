// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import type { Field, FieldState, Inspection } from "@meld/screen-runtime/edit/types";
import type { ScreenSource } from "@meld/screen-runtime/source";
import { createEditDraft, type Draft } from "./edit-draft";
import type { LiveController } from "./live-controller";
import type { ScreenCompiler } from "./screen-compiler";
import { HandEditPanel, type HandEditPanelProps } from "./hand-edit-panel";
import { useDraftHistory } from "./use-draft-history";

// The real Tweak body here (hand-edit-panel.test.tsx replaces it with a stub).
vi.mock("./code-editor", () => ({ default: () => null }));

const FIELDS: readonly Field[] = ["text", "color", "backgroundColor", "fontSize", "fontWeight", "fontFamily", "padding", "gap", "borderRadius", "width", "height"];
const fields = Object.fromEntries(FIELDS.map((field) => [field, { editable: true, value: null } as FieldState])) as NonNullable<Inspection>;
const source: ScreenSource = { kind: "html", entry: "index.html", files: { "index.html": "<b>Hi</b><i>There</i>" } };
const drafts: Draft[] = [];
afterEach(() => { cleanup(); for (const d of drafts.splice(0)) d.dispose(); });
const pick = (src: string, label: string, epoch: number, revision = 0) => ({ boardId: "a", src, label, epoch, revision, computed: null });
const pending = () => document.querySelector("[data-pending=true]") !== null;
const width = () => screen.getByRole("textbox", { name: /^Width/ });

function setup() {
  const draft = createEditDraft(source, "v1", vi.fn(async () => ({ status: "saved" as const, versionId: "v2" })), async () => null);
  drafts.push(draft);
  const liveState = { phase: "running" as const, screenId: "a", frameId: "f", attempt: 1, source, document: "doc", errors: [] };
  const live = { getState: () => liveState, subscribe: () => () => {}, canPick: () => true, setPickEnabled: vi.fn(), previewDraft: vi.fn() } as unknown as LiveController;
  const compiler = { inspect: vi.fn(async () => fields), tweak: vi.fn(async () => ({ ok: true as const, files: { "index.html": "<b style=\"color:red\">Hi</b><i>There</i>" } })) } as unknown as ScreenCompiler;
  const props: HandEditPanelProps = { draft, boardId: "a", tab: "tweak", compiler, live, picked: null, readOnly: false, issues: [], onClose: vi.fn(), onTabChange: vi.fn() };
  return { props, compiler, draft };
}

it("does not move text typed during a pending tweak into the next element's field, and keeps the node for the same one", async () => {
  function Board({ props, picked }: { props: HandEditPanelProps; picked: HandEditPanelProps["picked"] }) {
    const [reselect, setReselect] = useState<string | null>(null);
    return <HandEditPanel {...props} picked={picked} reselect={reselect} onReselect={setReselect} />;
  }
  const s = setup();
  const view = render(<Board props={s.props} picked={pick("index.html:0:9", "Hi", 1)} />);
  await waitFor(() => expect(width()).toBeEnabled());
  const node = width();
  node.focus();
  // A colour change is a tweak: the body goes pending while the element is read again.
  fireEvent.change(screen.getByRole("textbox", { name: "Text" }), { target: { value: "Hello" } });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Text" }), { key: "Enter" });
  await waitFor(() => expect(pending()).toBe(true));
  fireEvent.change(width(), { target: { value: "777" } }); // typed while pending
  fireEvent.keyDown(width(), { key: "Enter" }); // ignored while pending
  expect(s.compiler.tweak).toHaveBeenCalledTimes(1);
  // Same element read again: same node, and focus.
  view.rerender(<Board props={s.props} picked={pick("index.html:0:27", "Hi", 2, 1)} />);
  await waitFor(() => expect(pending()).toBe(false));
  expect(width()).toBe(node);
  expect(document.activeElement).toBe(node);
  expect(width()).toHaveValue("777");
  // Another element: the typed text is gone.
  view.rerender(<Board props={s.props} picked={pick("index.html:27:43", "There", 3, 1)} />);
  await waitFor(() => expect(screen.getByText("There")).toBeInTheDocument());
  expect(width()).toHaveValue("");
});

it("does not move text typed during a pending tweak into the next pick after the reselect times out", async () => {
  const control: { drop: () => void } = { drop: () => {} };
  function Board({ props, picked }: { props: HandEditPanelProps; picked: HandEditPanelProps["picked"] }) {
    const [reselect, setReselect] = useState<string | null>(null);
    control.drop = () => setReselect(null);
    return <HandEditPanel {...props} picked={picked} reselect={reselect} onReselect={setReselect} />;
  }
  const s = setup();
  const view = render(<Board props={s.props} picked={pick("index.html:0:9", "Hi", 1)} />);
  await waitFor(() => expect(width()).toBeEnabled());
  fireEvent.change(screen.getByRole("textbox", { name: "Text" }), { target: { value: "Hello" } });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Text" }), { key: "Enter" });
  await waitFor(() => expect(pending()).toBe(true));
  fireEvent.change(width(), { target: { value: "777" } });
  act(() => control.drop());
  // Another element is picked; its inspection is still in flight, then arrives.
  let resolve!: (value: Inspection) => void;
  vi.mocked(s.compiler.inspect).mockReturnValue(new Promise((r) => { resolve = r; }));
  view.rerender(<Board props={s.props} picked={pick("index.html:27:43", "There", 3, 1)} />);
  expect(screen.queryByText("Hi")).toBeNull();
  await act(async () => resolve(fields));
  expect(screen.getByText("There")).toBeInTheDocument();
  expect(width()).toHaveValue("");
});

// The pill drives Undo while the panel is open: the panel's observer keeps it showing the element's values.
it("keeps the same Tweak node when the pill undoes while the panel is open", async () => {
  type Observer = ((again: string | null) => void) | null;
  const s = setup();
  s.draft.replace({ "index.html": "<b style=\"color:red\">Hi</b><i>There</i>" });
  let observer: Observer = null;
  const registerHistoryObserver = (next: Observer) => { observer = next; };
  const reselects: (string | null)[] = [];
  let reselect: string | null = null;
  const editing = {
    live: s.props.live,
    subscribe: () => () => {},
    getSnapshot: () => 0,
    drafts: { get: () => s.draft },
    canEdit: () => true,
    getValidPick: () => pick("index.html:0:27", "Hi", 2, 1),
    getReselect: () => reselect,
    setReselect: (src: string | null) => { reselects.push(src); reselect = src; },
    setHistoryObserver: (next: Observer) => registerHistoryObserver(next),
    getHistoryObserver: () => observer,
  };
  const history: { current: ReturnType<typeof useDraftHistory> } = { current: null };
  function Board({ picked }: { picked: HandEditPanelProps["picked"] }) {
    history.current = useDraftHistory(editing as never);
    const [, force] = useState(0);
    return <HandEditPanel {...s.props} picked={picked} reselect={reselect} onReselect={(src) => { editing.setReselect(src); force((n) => n + 1); }} registerHistoryObserver={registerHistoryObserver} />;
  }
  const view = render(<Board picked={pick("index.html:0:27", "Hi", 2, 1)} />);
  await waitFor(() => expect(width()).toBeEnabled());
  expect(observer).not.toBeNull();
  const node = width();
  node.focus();
  expect(history.current).toMatchObject({ canUndo: true });
  act(() => history.current!.undo());
  expect(s.draft.getState().source.files["index.html"]).toBe("<b>Hi</b><i>There</i>");
  expect(reselects.at(-1)).toBe("index.html:0:9");
  // Carried: the body is pending on the same nodes, never unmounted.
  expect(pending()).toBe(true);
  expect(width()).toBe(node);
  expect(document.activeElement).toBe(node);
  view.rerender(<Board picked={pick("index.html:0:9", "Hi", 3, 2)} />);
  await waitFor(() => expect(pending()).toBe(false));
  expect(width()).toBe(node);
  // Closing the panel unregisters the observer.
  view.unmount();
  expect(observer).toBeNull();
});
