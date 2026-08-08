import type { PRDDocument } from "@meld/contracts";
import { PRD_SECTIONS, isSectionEmpty, type PrdSectionKind } from "./prd-sections";

function proseBody(value: string): string {
  return value.trim();
}

function listBody(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function mvpBody(scope: PRDDocument["mvpScope"]): string {
  const groups: string[] = [];
  if (scope.included.length > 0) {
    groups.push(["Included:", ...scope.included.map((item) => `- ${item}`)].join("\n"));
  }
  if (scope.excluded.length > 0) {
    groups.push(["Excluded:", ...scope.excluded.map((item) => `- ${item}`)].join("\n"));
  }
  return groups.join("\n\n");
}

function risksBody(rows: PRDDocument["risksAndMitigations"]): string {
  return rows.map((row) => `- **${row.risk}** — ${row.mitigation}`).join("\n");
}

// Source message links are an in-app affordance back into the conversation;
// they carry no meaning once copied or exported as text, so only the
// decision and its rationale come along.
function decisionsBody(rows: PRDDocument["decisionHistory"]): string {
  return rows.map((row) => `- **${row.decision}** — ${row.rationale}`).join("\n");
}

function sectionBody(
  kind: PrdSectionKind,
  value: PRDDocument[keyof PRDDocument],
): string {
  switch (kind) {
    case "prose":
      return proseBody(value as string);
    case "list":
      return listBody(value as string[]);
    case "mvp":
      return mvpBody(value as PRDDocument["mvpScope"]);
    case "risks":
      return risksBody(value as PRDDocument["risksAndMitigations"]);
    case "decisions":
      return decisionsBody(value as PRDDocument["decisionHistory"]);
  }
}

// Plain-text rendering of a PRD for the "Copy document" and "Export"
// actions. Mirrors PrdDocument's read view -- same sections, same
// empty-section skip -- as portable Markdown instead of React.
export function prdDocumentToMarkdown(document: PRDDocument): string {
  const sections = PRD_SECTIONS.filter(
    (section) => !isSectionEmpty(section.kind, document[section.field]),
  ).map(
    (section) =>
      `## ${section.label}\n\n${sectionBody(section.kind, document[section.field])}`,
  );

  return [`# ${document.title}`, ...sections].join("\n\n") + "\n";
}

// A filesystem-safe file name for the exported Markdown, derived from the
// document title so the download isn't just "untitled.md".
export function prdDocumentFileName(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "prd"}.md`;
}
