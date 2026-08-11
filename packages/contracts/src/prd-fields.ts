import { PRDDocumentSchema, type PRDDocument } from "./prd";

export type PrdFieldName = keyof PRDDocument;

const FIELD_SHAPE = PRDDocumentSchema.shape;

export const PRD_FIELD_NAMES = Object.keys(
  FIELD_SHAPE,
) as readonly PrdFieldName[];

// The canonical order a PRD's sections are read in -- the order `PRD_SECTIONS`
// renders them in (apps/web), not the order `PRDDocumentSchema` happens to
// declare its keys in: those two differ around `mvpScope` / `risksAndMitigations`,
// and only this one describes what a reader sees. Anything that treats a
// selection as a run of adjacent sections must order it by this list, and
// `prd-sections.test.ts` asserts the rendered document still agrees with it.
// `title` is the document's name, not a section, so it is absent.
export const PRD_SECTION_ORDER: readonly Exclude<PrdFieldName, "title">[] = [
  "executiveSummary",
  "problemAndEvidence",
  "targetUsersAndUseCases",
  "goalsNonGoalsAndMetrics",
  "proposedSolution",
  "userJourneys",
  "functionalRequirements",
  "nonFunctionalRequirements",
  "uxStatesAndEdgeCases",
  "dependenciesAndConstraints",
  "mvpScope",
  "risksAndMitigations",
  "acceptanceCriteria",
  "openQuestions",
  "decisionHistory",
];

export function isPrdFieldName(value: string): value is PrdFieldName {
  return Object.hasOwn(FIELD_SHAPE, value);
}

export function parsePrdFieldValue(
  field: PrdFieldName,
  value: unknown,
): { ok: true; value: unknown } | { ok: false } {
  const result = FIELD_SHAPE[field].safeParse(value);
  return result.success ? { ok: true, value: result.data } : { ok: false };
}
