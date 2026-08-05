import type { PRDDocument } from "@meld/contracts";
import { PRD_SECTIONS } from "./prd-sections";

export type PrdDiff = {
  sectionId: string;
  label: string;
  before: unknown;
  after: unknown;
};

const equal = (before: unknown, after: unknown) =>
  JSON.stringify(before) === JSON.stringify(after);

export function diffPrdDocuments(
  before: PRDDocument,
  after: PRDDocument,
): PrdDiff[] {
  const diffs: PrdDiff[] = [];
  if (!equal(before.title, after.title)) {
    diffs.push({
      sectionId: "title",
      label: "Title",
      before: before.title,
      after: after.title,
    });
  }

  for (const section of PRD_SECTIONS) {
    const beforeValue = before[section.field];
    const afterValue = after[section.field];
    if (!equal(beforeValue, afterValue)) {
      diffs.push({
        sectionId: section.id,
        label: section.label,
        before: beforeValue,
        after: afterValue,
      });
    }
  }

  return diffs;
}
