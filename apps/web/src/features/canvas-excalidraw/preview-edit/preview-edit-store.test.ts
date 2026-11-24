import { describe, expect, it, vi } from "vitest";
import { FIELDS } from "@meld/screen-runtime/edit/types";
import { createPreviewEditStore, installPreviewEditBridge, type PreviewSelection } from "./preview-edit-store";

const selection: PreviewSelection = {
  starId: "s1",
  selectionId: "pick1",
  label: "p",
  tag: "p",
  html: "<p>Hi</p>",
  fields: null,
  computed: {
    fontFamily: "Inter", fontSize: "16px", fontWeight: "400", color: "rgb(0, 0, 0)",
    backgroundColor: "rgba(0, 0, 0, 0)", width: "100px", height: "20px",
    padding: "4px", gap: "normal", borderRadius: "0px", display: "block",
  },
  reason: "Orion can't find this element's code.",
  locked: null,
  canUndo: false,
  canRedo: false,
  pending: false,
};

describe("preview edit bridge", () => {
  it("publishes selection and drains a request only once", () => {
    const store = createPreviewEditStore();
    const win = {} as Window;
    const remove = installPreviewEditBridge(win, store);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    win.__orionPreviewEdit!.setSelection(JSON.stringify(selection));
    expect(store.get()).toEqual(selection);
    expect(listener).toHaveBeenCalledTimes(1);
    store.enqueue(selection.selectionId, { kind: "describe", text: "Make this bold" });
    expect(win.__orionPreviewEdit!.take()).toEqual([
      { selectionId: selection.selectionId, kind: "describe", text: "Make this bold" },
    ]);
    expect(win.__orionPreviewEdit!.take()).toEqual([]);
    unsubscribe();
    remove();
    expect(win.__orionPreviewEdit).toBeUndefined();
    expect(store.get()).toBeNull();
  });

  it("drops queued and late requests when a different element is picked", () => {
    const store = createPreviewEditStore();
    const win = {} as Window;
    installPreviewEditBridge(win, store);
    const bridge = win.__orionPreviewEdit!;
    bridge.setSelection(JSON.stringify(selection));
    store.enqueue(selection.selectionId, { kind: "undo" });
    bridge.setSelection(JSON.stringify({ ...selection, selectionId: "pick2" }));
    store.enqueue(selection.selectionId, { kind: "redo" });
    expect(bridge.take()).toEqual([]);
  });

  it("keeps the selection when a source literal or tag exceeds its display limits", () => {
    const store = createPreviewEditStore();
    const value = "x".repeat(2_001);
    const tag = "custom-" + "a".repeat(70);
    const fields = Object.fromEntries(FIELDS.map((field) => [field, { editable: true, value: null }]));
    store.setFromJson(JSON.stringify({
      ...selection,
      tag,
      label: tag,
      fields: {
        ...fields,
        text: { editable: true, value: "first run", runs: ["first run", value] },
        fontFamily: { editable: true, value },
      },
    }));
    expect(store.get()).toMatchObject({
      tag: tag.slice(0, 40),
      label: tag.slice(0, 60),
      fields: {
        text: { editable: false, value: "first run" },
        fontFamily: { editable: false, value: value.slice(0, 2_000) },
        color: { editable: true, value: null },
      },
    });
    expect(store.get()?.fields?.text.runs).toBeUndefined();
    store.enqueue(selection.selectionId, { kind: "describe", text: "Shorten this" });
    expect(store.take()).toEqual([{ selectionId: selection.selectionId, kind: "describe", text: "Shorten this" }]);
  });

  it("rejects malformed, oversized and incomplete selection payloads", () => {
    const store = createPreviewEditStore();
    const win = {} as Window;
    installPreviewEditBridge(win, store);
    const bridge = win.__orionPreviewEdit!;
    for (const json of [
      "{not json",
      JSON.stringify({ ...selection, html: "x".repeat(601) }),
      JSON.stringify({ ...selection, fields: { text: { editable: true, value: "Hi" } } }),
    ]) {
      bridge.setSelection(JSON.stringify(selection));
      bridge.setSelection(json);
      expect(store.get()).toBeNull();
    }
  });
});
