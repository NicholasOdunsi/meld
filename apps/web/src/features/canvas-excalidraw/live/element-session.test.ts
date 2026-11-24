import { describe, expect, it, vi } from "vitest";
import type { EditResult, Inspection } from "@meld/screen-runtime/edit/types";
import { createEditDraft } from "./edit-draft";
import {
  commitTweak,
  inspectPickedElement,
  shiftTag,
  tagFile,
  type Selected,
} from "./element-session";
const page = (text: string) => ({
  kind: "html" as const,
  entry: "index.html",
  files: { "index.html": text },
});
const selected = (): Selected => ({
  src: "index.html:0:8",
  label: "Action",
  boardId: "board",
  revision: 0,
  epoch: 1,
  computed: null,
});
it("does not apply delayed tweak over typing or a switched selection object", async () => {
  for (const race of ["typing", "switch"]) {
    const draft = createEditDraft(
      page("old"),
      "v1",
      async () => ({ status: "error" }),
      async () => null,
    );
    const pick = selected();
    let current: Selected | null = pick;
    let finish!: (reply: EditResult) => void;
    const tweak = vi.fn(
      () =>
        new Promise<EditResult>((r) => {
          finish = r;
        }),
    );
    const preview = vi.fn();
    const pending = commitTweak(
      draft,
      pick,
      { field: "text", value: "new" },
      { tweak },
      () => current,
      preview,
    );
    if (race === "typing") draft.replace(page("typed").files);
    else current = { ...pick, epoch: 2 };
    finish({ ok: true, files: page("tweaked").files });
    await pending;
    expect(draft.getState().source).toEqual(
      page(race === "typing" ? "typed" : "old"),
    );
    expect(preview).not.toHaveBeenCalled();
    draft.dispose();
  }
});
it("commits valid tweaks and rejects invalid output or worker failures", async () => {
  const draft = createEditDraft(
    page("old"),
    "v1",
    async () => ({ status: "error" }),
    async () => null,
  );
  const pick = selected();
  const preview = vi.fn();
  await commitTweak(
    draft,
    pick,
    { field: "text", value: "new" },
    { tweak: async () => ({ ok: true, files: page("new").files }) },
    () => pick,
    preview,
  );
  expect(preview).toHaveBeenCalledWith(page("new"), 1);
  const newer = { ...pick, revision: 1 };
  await commitTweak(
    draft,
    newer,
    { field: "text", value: "bad" },
    { tweak: async () => ({ ok: true, files: {} }) },
    () => newer,
    preview,
  );
  expect(draft.getState().revision).toBe(1);
  await commitTweak(
    draft,
    newer,
    { field: "text", value: "bad" },
    {
      tweak: async () => {
        throw new Error("worker");
      },
    },
    () => newer,
    preview,
  );
  draft.dispose();
});
it("fences delayed inspection", async () => {
  const draft = createEditDraft(
    page("old"),
    "v1",
    async () => ({ status: "error" }),
    async () => null,
  );
  const pick = selected();
  let finish!: (value: Inspection) => void;
  const pending = inspectPickedElement(
    draft,
    pick,
    {
      inspect: () =>
        new Promise<Inspection>((r) => {
          finish = r;
        }),
    },
    () => pick,
  );
  draft.replace(page("new").files);
  finish({} as Inspection);
  expect(await pending).toBeNull();
  draft.dispose();
});
describe("element tags after an edit", () => {
  it("moves the end of a tag by the change in length and keeps the file and start", () => {
    expect(shiftTag("a.tsx:10:50", 7)).toBe("a.tsx:10:57");
    expect(shiftTag("src/a.tsx:10:50", -5)).toBe("src/a.tsx:10:45");
    expect(shiftTag("a.tsx:10:50", 0)).toBe("a.tsx:10:50");
  });
  it("returns input it cannot parse, or an element that would vanish, unchanged", () => {
    expect(shiftTag("nonsense", 3)).toBe("nonsense");
    expect(shiftTag("a.tsx:10:50", -40)).toBe("a.tsx:10:50");
  });
  it("reads the file out of a tag", () => {
    expect(tagFile("src/a.tsx:10:50")).toBe("src/a.tsx");
    expect(tagFile("nonsense")).toBe("");
  });
});
