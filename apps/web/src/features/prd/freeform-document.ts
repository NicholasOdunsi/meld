import type {
  FreeformDocument,
  FreeformNode,
  FlowDocument,
  PRDDocument,
  StoredPRDDocument,
} from "@meld/contracts";
import { FlowDocumentSchema, isFreeformDocument } from "@meld/contracts";
import { PRD_SECTIONS, type PrdSectionKind } from "./prd-sections";

function blockId(key: string, index = 0): string {
  return `legacy-${key}-${index}`;
}

function text(value: string): FreeformNode[] | undefined {
  return value ? [{ type: "text", text: value }] : undefined;
}

function paragraph(value: string, meldId: string): FreeformNode {
  return { type: "paragraph", attrs: { meldId }, content: text(value) };
}

function heading(value: string, meldId: string, level: 1 | 2 | 3 = 2): FreeformNode {
  return {
    type: "heading",
    attrs: { meldId, level },
    content: text(value),
  };
}

function bulletList(items: string[], meldId: string): FreeformNode | null {
  const content = items
    .filter((item) => item.trim().length > 0)
    .map((item) => ({
      type: "listItem",
      content: [{ type: "paragraph", content: text(item) }],
    }));
  return content.length > 0
    ? { type: "bulletList", attrs: { meldId }, content }
    : null;
}

function proseBlocks(value: string, key: string): FreeformNode[] {
  return value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => paragraph(part, blockId(key, index)));
}

function legacySectionBlocks(
  document: PRDDocument,
  field: keyof PRDDocument,
  kind: PrdSectionKind,
  key: string,
  canvasHref?: string,
): FreeformNode[] {
  const value = document[field];
  switch (kind) {
    case "prose":
      return proseBlocks(value as string, key);
    case "list": {
      const list = bulletList(value as string[], blockId(key));
      return list ? [list] : [];
    }
    case "flow": {
      const journeys = value as PRDDocument["userJourneys"];
      if (!journeys) return [];
      if (typeof journeys === "string") return proseBlocks(journeys, key);
      const labels = journeys.nodes.map((node) => node.label);
      const list = bulletList(labels, blockId(key));
      const preview: FreeformNode = {
        type: "flowPreview",
        attrs: {
          meldId: blockId(`${key}-preview`),
          flow: journeys,
          href: canvasHref ?? null,
        },
      };
      // FlowPreview already owns the one Canvas link. Adding a second link
      // block here rendered the same action twice beneath every legacy flow.
      return list ? [list, preview] : [];
    }
    case "mvp": {
      const scope = value as PRDDocument["mvpScope"];
      const blocks: FreeformNode[] = [];
      const included = bulletList(scope.included, blockId(`${key}-included`));
      const excluded = bulletList(scope.excluded, blockId(`${key}-excluded`));
      if (included) {
        blocks.push(heading("Included", blockId(`${key}-included-heading`), 3));
        blocks.push(included);
      }
      if (excluded) {
        blocks.push(heading("Excluded", blockId(`${key}-excluded-heading`), 3));
        blocks.push(excluded);
      }
      return blocks;
    }
    case "risks":
      return (value as PRDDocument["risksAndMitigations"]).flatMap(
        (row, index) => [
          paragraph(`Risk: ${row.risk}`, blockId(`${key}-risk`, index)),
          paragraph(
            `Mitigation: ${row.mitigation}`,
            blockId(`${key}-mitigation`, index),
          ),
        ],
      );
    case "decisions":
      return (value as PRDDocument["decisionHistory"]).flatMap(
        (row, index) => [
          paragraph(`Decision: ${row.decision}`, blockId(`${key}-decision`, index)),
          paragraph(
            `Rationale: ${row.rationale}`,
            blockId(`${key}-rationale`, index),
          ),
        ],
      );
  }
}

export function createEmptyFreeformDocument(): FreeformDocument {
  return {
    format: "blocks-v1",
    title: "",
    body: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { meldId: crypto.randomUUID() },
        },
      ],
    },
  };
}

export function legacyPrdToBlocks(
  document: PRDDocument,
  canvasHref?: string,
): FreeformDocument {
  const content: FreeformNode[] = [];
  for (const section of PRD_SECTIONS) {
    const body = legacySectionBlocks(
      document,
      section.field,
      section.kind,
      section.id,
      canvasHref,
    );
    if (body.length === 0) continue;
    content.push(heading(section.label, blockId(`${section.id}-heading`)));
    content.push(...body);
  }
  return {
    format: "blocks-v1",
    title: document.title,
    body: {
      type: "doc",
      content:
        content.length > 0
          ? content
          : [{ type: "paragraph", attrs: { meldId: blockId("empty") } }],
    },
  };
}

export function normalizePrdDocument(
  document: StoredPRDDocument,
  canvasHref?: string,
): FreeformDocument {
  return isFreeformDocument(document)
    ? structuredClone(document)
    : legacyPrdToBlocks(document, canvasHref);
}

export function hasMeaningfulDocumentContent(document: FreeformDocument): boolean {
  if (document.title.trim()) return true;
  const visit = (node: FreeformNode): boolean =>
    Boolean(node.text?.trim()) || Boolean(node.content?.some(visit));
  return Boolean(document.body.content?.some(visit));
}

export function extractUserJourneyFlow(
  document: StoredPRDDocument,
): FlowDocument | null {
  if (!isFreeformDocument(document)) return document.userJourneys && typeof document.userJourneys === "object"
    ? document.userJourneys
    : null;
  const visit = (nodes: FreeformNode[] | undefined): FlowDocument | null => {
    for (const node of nodes ?? []) {
      if (node.type === "flowPreview") {
        const flow = FlowDocumentSchema.safeParse(node.attrs?.flow);
        if (flow.success) return flow.data;
      }
      const nested = visit(node.content);
      if (nested) return nested;
    }
    return null;
  };
  return visit(document.body.content);
}
