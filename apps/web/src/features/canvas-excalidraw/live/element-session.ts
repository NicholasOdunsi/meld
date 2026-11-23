import {
  ScreenSourceSchema,
  type ScreenSource,
} from "@meld/screen-runtime/source";
import type { Inspection, Tweak } from "@meld/screen-runtime/edit/types";
import type { Draft } from "./edit-draft";
import { parseElementTag } from "./element-tag";
import type { ScreenCompiler } from "./screen-compiler";
import type { Computed } from "./live-messages";

export type Selected = {
  src: string;
  label: string;
  boardId: string;
  revision: number;
  epoch: number;
  computed: Computed | null;
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

// The file part of a "file:start:end" element tag.
export function tagFile(src: string): string {
  return parseElementTag(src)?.file ?? "";
}

// An edit splices inside one element, so after it the element starts at the
// same place and ends `delta` characters later (or earlier).
export function shiftTag(src: string, delta: number): string {
  const tag = parseElementTag(src);
  if (!tag) return src;
  const end = tag.end + delta;
  return Number.isSafeInteger(end) && end > tag.start ? `${tag.file}:${tag.start}:${end}` : src;
}
