import {
  isPrdFieldName,
  type PRDDocument,
  type PrdFieldName,
} from "@meld/contracts";

export type PrdSelection = {
  field: Exclude<PrdFieldName, "title">;
  quotedText: string;
};

function sectionElement(node: Node | null): HTMLElement | null {
  let current: Node | null = node;
  while (current) {
    if (current.nodeType === 1) {
      const element = current as HTMLElement;
      if (element.dataset.prdSectionField) return element;
    }
    current = current.parentNode;
  }
  return null;
}

export function resolvePrdSelection(
  selection: Pick<Selection, "isCollapsed" | "toString" | "anchorNode" | "focusNode"> | null,
): PrdSelection | null {
  if (!selection || selection.isCollapsed) return null;

  const quotedText = selection.toString().trim();
  if (!quotedText) return null;

  const startSection = sectionElement(selection.anchorNode);
  const endSection = sectionElement(selection.focusNode);
  if (!startSection || startSection !== endSection) return null;

  const field = startSection.dataset.prdSectionField;
  if (!field || !isPrdFieldName(field) || field === "title") return null;

  return { field: field as Exclude<PrdFieldName, "title">, quotedText };
}

export function sectionFieldValue(
  document: PRDDocument,
  selection: PrdSelection,
): PRDDocument[PrdSelection["field"]] {
  return document[selection.field];
}
