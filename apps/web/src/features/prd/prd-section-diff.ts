import type { PRDDocument } from "@meld/contracts";
import type { PrdSectionKind } from "./prd-sections";

export type PrdSectionDiff = {
  kind: PrdSectionKind;
  before: unknown;
  after: unknown;
};

export function diffPrdSection(
  kind: PrdSectionKind,
  before: PRDDocument[keyof PRDDocument],
  after: PRDDocument[keyof PRDDocument],
): PrdSectionDiff | null {
  if (JSON.stringify(before) === JSON.stringify(after)) return null;
  return { kind, before, after };
}

export function sectionDiffLines(diff: PrdSectionDiff): Array<{
  status: "removed" | "added";
  value: string;
}> {
  const stringify = (value: unknown) =>
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const before = stringify(diff.before);
  const after = stringify(diff.after);
  return [
    { status: "removed", value: before },
    { status: "added", value: after },
  ];
}
