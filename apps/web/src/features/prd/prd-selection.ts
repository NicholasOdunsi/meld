import {
  PRD_SECTION_ORDER,
  PrdAssistScopeSchema,
  isPrdFieldName,
  type PrdAssistScopeSection,
} from "@meld/contracts";
import { PRD_SECTIONS } from "./prd-sections";

// The rendered label a section carries into the frozen scope. Read from
// PRD_SECTIONS rather than the DOM so the label the Product Agent is given is
// the canonical one, not whatever markup happened to be selected.
const SECTION_LABELS = new Map(
  PRD_SECTIONS.map((section) => [section.field as string, section.label]),
);

// PRD_SECTION_ORDER is the single ordering authority (packages/contracts).
const SECTION_POSITION = new Map(
  PRD_SECTION_ORDER.map((field, index) => [field as string, index]),
);

type ResolvableSelection = Pick<
  Selection,
  "isCollapsed" | "rangeCount" | "getRangeAt"
>;

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

// The part of `range` that falls inside `element`. A middle section is carried
// whole -- heading and all, because that is genuinely what the drag covered --
// while the first and last sections are clamped to where it started and
// stopped.
function selectedFragment(element: HTMLElement, range: Range): string {
  const fragment = element.ownerDocument.createRange();
  fragment.selectNodeContents(element);
  if (element.contains(range.startContainer)) {
    fragment.setStart(range.startContainer, range.startOffset);
  }
  if (element.contains(range.endContainer)) {
    fragment.setEnd(range.endContainer, range.endOffset);
  }
  return fragment.toString();
}

// One native selection to the ordered scope a request is frozen against, or
// null when the selection is not something we are willing to ask about.
//
// The browser normalizes a Range into document order whichever way the user
// dragged, so a backward selection needs no special case here: it reaches this
// function already start-before-end.
//
// The scope's own rules -- unique non-title fields in rendered document order,
// the per-fragment cap and the total-selection cap -- are not restated here.
// The selection is parsed through the contract's schema instead, so the
// popover and the server action can never disagree about what is selectable.
export function resolvePrdSelection(
  selection: ResolvableSelection | null,
): PrdAssistScopeSection[] | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const start = sectionElement(range.startContainer);
  const end = sectionElement(range.endContainer);
  // Beginning or ending outside a PRD section means the drag was not about the
  // document, so there is nothing to ask about.
  if (!start || !end) return null;

  const sections: PrdAssistScopeSection[] = [];
  const elements = start.ownerDocument.querySelectorAll<HTMLElement>(
    "[data-prd-section-field]",
  );
  for (const element of elements) {
    if (!range.intersectsNode(element)) continue;
    const field = element.dataset.prdSectionField;
    if (!field || !isPrdFieldName(field) || field === "title") return null;
    const label = SECTION_LABELS.get(field);
    if (!label) return null;
    const quotedText = selectedFragment(element, range).trim();
    // A section the selection merely touches at a boundary contributes no
    // text, and an empty quote is not a fragment anyone asked about.
    if (!quotedText) continue;
    sections.push({ field, label, quotedText });
  }

  sections.sort(
    (left, right) =>
      SECTION_POSITION.get(left.field)! - SECTION_POSITION.get(right.field)!,
  );

  // `canProposeEdit` is the server's to decide from room access; the value here
  // only satisfies the schema's shape and is discarded.
  const scope = PrdAssistScopeSchema.safeParse({
    sections,
    canProposeEdit: false,
  });
  return scope.success ? scope.data.sections : null;
}
