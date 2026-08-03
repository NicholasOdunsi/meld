import type { PRDDocument } from "@meld/contracts";
import { PRD_SECTIONS } from "./prd-sections";

export type PrdGap = {
  id: string;
  sectionId: string;
  message: string;
};

const isBlank = (value: string) => value.trim().length === 0;

export function findPrdGaps(document: PRDDocument): PrdGap[] {
  const gaps: PrdGap[] = [];
  const add = (id: string, sectionId: string, message: string) =>
    gaps.push({ id, sectionId, message });

  for (const section of PRD_SECTIONS) {
    const value = document[section.field];

    if (section.kind === "prose") {
      if (typeof value === "string" && isBlank(value)) {
        add(section.id, section.id, `${section.label} is empty.`);
      }
      continue;
    }

    if (section.kind === "list") {
      const rows = value as string[];
      rows.forEach((row, index) => {
        if (section.id === "open-questions") {
          add(
            `${section.id}-${index}`,
            section.id,
            `Open question row ${index + 1} needs follow-up.`,
          );
        } else if (isBlank(row)) {
          add(
            `${section.id}-${index}`,
            section.id,
            `${section.label} row ${index + 1} is empty.`,
          );
        }
      });
      continue;
    }

    if (section.kind === "mvp") {
      const scope = value as PRDDocument["mvpScope"];
      for (const [name, rows] of [
        ["Included", scope.included],
        ["Excluded", scope.excluded],
      ] as const) {
        rows.forEach((row, index) => {
          if (isBlank(row)) {
            add(
              `${section.id}-${name.toLowerCase()}-${index}`,
              section.id,
              `${name} MVP row ${index + 1} is empty.`,
            );
          }
        });
      }
      continue;
    }

    if (section.kind === "risks") {
      const rows = value as PRDDocument["risksAndMitigations"];
      rows.forEach((row, index) => {
        if (isBlank(row.risk)) {
          add(`${section.id}-${index}-risk`, section.id, `Risk row ${index + 1} is empty.`);
        }
        if (isBlank(row.mitigation)) {
          add(
            `${section.id}-${index}-mitigation`,
            section.id,
            `Mitigation row ${index + 1} is empty.`,
          );
        }
      });
      continue;
    }

    const rows = value as PRDDocument["decisionHistory"];
    rows.forEach((row, index) => {
      if (isBlank(row.decision)) {
        add(`${section.id}-${index}-decision`, section.id, `Decision row ${index + 1} is missing a decision.`);
      }
      if (isBlank(row.rationale)) {
        add(`${section.id}-${index}-rationale`, section.id, `Decision row ${index + 1} is missing a rationale.`);
      }
      if (row.sourceMessageIds.length === 0) {
        add(`${section.id}-${index}-source-link`, section.id, `Decision row ${index + 1} is missing a source link.`);
      } else {
        row.sourceMessageIds.forEach((sourceMessageId, sourceIndex) => {
          if (isBlank(sourceMessageId)) {
            add(
              `${section.id}-${index}-source-link-${sourceIndex}`,
              section.id,
              `Decision row ${index + 1} source link ${sourceIndex + 1} is empty.`,
            );
          }
        });
      }
    });
  }

  return gaps;
}
