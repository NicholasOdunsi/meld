import {
  ScreenSourceSchema,
  type ScreenSource,
} from "@meld/screen-runtime/source";
import type { Inspection, Tweak } from "@meld/screen-runtime/edit/types";
import type { Draft } from "./edit-draft";
import type { ScreenCompiler } from "./screen-compiler";

export type Selected = {
  src: string;
  label: string;
  boardId: string;
  revision: number;
  epoch: number;
};
export type ElementChip = {
  kind: "element";
  screenId: string;
  versionId: string;
  src: string;
  label: string;
};

export async function inspectPickedElement(
  draft: Draft,
  selected: Selected,
  compiler: Pick<ScreenCompiler, "inspect">,
  current: () => Selected | null,
): Promise<Inspection> {
  const before = draft.getState();
  if (current() !== selected || before.revision !== selected.revision)
    return null;
  try {
    const fields = await compiler.inspect(before.source.files, selected.src);
    return current() === selected &&
      draft.getState().revision === before.revision
      ? fields
      : null;
  } catch {
    return null;
  }
}

export async function commitTweak(
  draft: Draft,
  selected: Selected,
  tweak: Tweak,
  compiler: Pick<ScreenCompiler, "tweak">,
  current: () => Selected | null,
  preview: (source: ScreenSource, revision: number) => void,
): Promise<void> {
  const before = draft.getState();
  if (selected.revision !== before.revision || current() !== selected) return;
  let result: Awaited<ReturnType<ScreenCompiler["tweak"]>>;
  try {
    result = await compiler.tweak(before.source.files, selected.src, tweak);
  } catch {
    return;
  }
  if (
    current() !== selected ||
    draft.getState().revision !== before.revision ||
    !result.ok
  )
    return;
  const source = { ...before.source, files: result.files };
  if (!ScreenSourceSchema.safeParse(source).success) return;
  draft.replace(result.files);
  const after = draft.getState();
  if (after.revision !== before.revision) preview(after.source, after.revision);
}

export async function addPickedElement(
  draft: Draft,
  selected: Selected,
  current: () => Selected | null,
  identity: () => { screenId: string } | null,
  send?: (chip: ElementChip) => void,
): Promise<boolean> {
  if (
    !send ||
    current() !== selected ||
    draft.getState().revision !== selected.revision
  )
    return false;
  await draft.flush();
  const after = draft.getState(),
    target = identity();
  if (
    after.status !== "clean" ||
    after.revision !== selected.revision ||
    current() !== selected ||
    !target ||
    !after.base
  )
    return false;
  send({
    kind: "element",
    screenId: target.screenId,
    versionId: after.base,
    src: selected.src,
    label: selected.label,
  });
  return true;
}
