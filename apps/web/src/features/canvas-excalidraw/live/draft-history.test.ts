import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScreenSource } from "@meld/screen-runtime/source";
import { createEditDraft, type Draft } from "./edit-draft";
import { runHistory } from "./draft-history";

const source: ScreenSource = { kind: "html", entry: "index.html", files: { "index.html": "<b>Hi</b>" } };
const drafts: Draft[] = [];
afterEach(() => { for (const draft of drafts.splice(0)) draft.dispose(); });

function setup(edited = "<b>New</b>") {
  const draft = createEditDraft(source, "v1", vi.fn(async () => ({ status: "saved" as const, versionId: "v2" })), async () => null);
  drafts.push(draft);
  if (edited !== source.files["index.html"]) draft.replace({ "index.html": edited });
  const live = { previewDraft: vi.fn() };
  const onReselect = vi.fn();
  const ctx = { draft, live, boardId: "a", picked: null as { src: string } | null, reselect: null as string | null, onReselect };
  return { draft, live, onReselect, ctx };
}

describe("runHistory", () => {
  it("undo steps the draft back and previews it as history", () => {
    const { draft, live, ctx } = setup();
    expect(runHistory("undo", ctx)).toBe(true);
    expect(draft.getState().source).toEqual(source);
    expect(live.previewDraft).toHaveBeenCalledWith("a", source, 2, "history");
  });

  it("redo steps forward again", () => {
    const { live, ctx } = setup();
    runHistory("undo", ctx);
    expect(runHistory("redo", ctx)).toBe(true);
    expect(live.previewDraft).toHaveBeenLastCalledWith("a", expect.objectContaining({ files: { "index.html": "<b>New</b>" } }), 3, "history");
  });

  it("does nothing, and previews nothing, when there is nothing to undo or redo", () => {
    const { live, onReselect, ctx } = setup("<b>Hi</b>");
    expect(runHistory("undo", ctx)).toBe(false);
    expect(runHistory("redo", ctx)).toBe(false);
    expect(live.previewDraft).not.toHaveBeenCalled();
    expect(onReselect).not.toHaveBeenCalled();
  });

  it("selects nothing again when nothing was selected", () => {
    const { onReselect, ctx } = setup();
    runHistory("undo", ctx);
    expect(onReselect).toHaveBeenLastCalledWith(null);
  });

  it("keeps the selected element through undo and redo of a tweak (its tag is remapped)", () => {
    const styled = '<b style="color:#abcdef">Hi</b>';
    const { onReselect, ctx } = setup(styled);
    runHistory("undo", { ...ctx, picked: { src: `index.html:0:${styled.length}` } });
    expect(onReselect).toHaveBeenLastCalledWith("index.html:0:9");
    runHistory("redo", { ...ctx, picked: { src: "index.html:0:9" } });
    expect(onReselect).toHaveBeenLastCalledWith(`index.html:0:${styled.length}`);
  });

  it("remaps the element that is about to be selected again when nothing is picked yet", () => {
    const styled = '<b style="color:#abcdef">Hi</b>';
    const { onReselect, ctx } = setup(styled);
    runHistory("undo", { ...ctx, reselect: `index.html:0:${styled.length}` });
    expect(onReselect).toHaveBeenLastCalledWith("index.html:0:9");
  });

  it("drops the selection when undo removes the element", () => {
    const two = "<b>Hi</b><i>x</i>";
    const { onReselect, ctx } = setup(two);
    runHistory("undo", { ...ctx, picked: { src: "index.html:9:17" } });
    expect(onReselect).toHaveBeenLastCalledWith(null);
  });

  it("reselects before it previews, and tells the caller the element to carry", () => {
    const { live, onReselect, ctx } = setup();
    const onPreview = vi.fn();
    runHistory("undo", { ...ctx, onPreview });
    expect(onPreview).toHaveBeenCalledWith(null);
    expect(onReselect.mock.invocationCallOrder[0]).toBeLessThan(live.previewDraft.mock.invocationCallOrder[0]);
    expect(onPreview.mock.invocationCallOrder[0]).toBeLessThan(live.previewDraft.mock.invocationCallOrder[0]);
  });
});
