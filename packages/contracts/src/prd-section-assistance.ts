import { z } from "zod";
import type { PRDDocument } from "./prd";
import {
  PRD_FIELD_NAMES,
  parsePrdFieldValue,
  type PrdFieldName,
} from "./prd-fields";

export const MAX_PRD_ASSIST_SECTIONS = 15;
export const MAX_PRD_ASSIST_SECTION_QUOTE_CHARS = 10_000;
export const MAX_PRD_ASSIST_TOTAL_QUOTE_CHARS = 20_000;
export const MAX_PRD_ASSIST_ANSWER_CHARS = 20_000;
export const MAX_PRD_ASSIST_QUESTION_CHARS = 2_000;

// The title is the document's name, not a section anyone selects and asks
// about, so it is never a scope entry and never a proposal target.
export type PrdAssistFieldName = Exclude<PrdFieldName, "title">;

const ASSIST_FIELD_NAMES = PRD_FIELD_NAMES.filter(
  (field): field is PrdAssistFieldName => field !== "title",
);

const FIELD_ORDER = new Map(
  ASSIST_FIELD_NAMES.map((field, index) => [field, index] as const),
);

export const PrdAssistFieldNameSchema = z.enum(
  ASSIST_FIELD_NAMES as [PrdAssistFieldName, ...PrdAssistFieldName[]],
);

export const PrdAssistScopeSectionSchema = z
  .object({
    field: PrdAssistFieldNameSchema,
    label: z.string().min(1),
    quotedText: z.string().min(1).max(MAX_PRD_ASSIST_SECTION_QUOTE_CHARS),
  })
  .strict();
export type PrdAssistScopeSection = z.infer<typeof PrdAssistScopeSectionSchema>;

// The scope is frozen at submission time and is the only thing a proposal may
// target, so its shape is the safety boundary: unique fields in document order
// keep it a faithful description of one contiguous selection, and the two
// length caps keep a selection from swallowing the hydrated context budget.
export const PrdAssistScopeSchema = z
  .object({
    sections: z
      .array(PrdAssistScopeSectionSchema)
      .min(1)
      .max(MAX_PRD_ASSIST_SECTIONS),
    canProposeEdit: z.boolean(),
  })
  .strict()
  .refine(
    ({ sections }) =>
      sections.every(
        (section, index) =>
          index === 0 ||
          FIELD_ORDER.get(sections[index - 1].field)! <
            FIELD_ORDER.get(section.field)!,
      ),
    { message: "Selected sections must be unique and in document order" },
  )
  .refine(
    ({ sections }) =>
      sections.reduce((total, { quotedText }) => total + quotedText.length, 0) <=
      MAX_PRD_ASSIST_TOTAL_QUOTE_CHARS,
    { message: "Selected sections exceed the total selected-character limit" },
  );
export type PrdAssistScope = z.infer<typeof PrdAssistScopeSchema>;

// A model told a slot "may be empty" writes "" rather than null often enough
// that treating a blank as a real value would throw away otherwise perfect
// results -- the same failure the RoomReplyResultSchema list defaults exist to
// avoid. A blank slot means absent; a result that is blank everywhere still
// fails the all-null rule below.
const absentIfBlank = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().min(1).max(max).nullable(),
  );

export const PrdSectionAssistEnvelopeSchema = z
  .object({
    answer: absentIfBlank(MAX_PRD_ASSIST_ANSWER_CHARS),
    proposal: z
      .object({ targetField: z.string(), value: z.unknown() })
      .strict()
      .nullable(),
    clarifyingQuestion: absentIfBlank(MAX_PRD_ASSIST_QUESTION_CHARS),
    citedMessageIds: z.array(z.string().uuid()).max(100),
    citedEvidenceIds: z.array(z.string().uuid()).max(100),
    assumptions: z.array(z.string().trim().min(1).max(2_000)).max(20),
    suggestedNextQuestions: z.array(z.string().trim().min(1).max(2_000)).max(5),
  })
  .strict();
export type PrdSectionAssistEnvelope = z.infer<
  typeof PrdSectionAssistEnvelopeSchema
>;

// One branch per field, so a parsed proposal's value is typed by the field it
// targets and the union has no shape that carries two fields at once.
export type PrdSectionAssistProposal = {
  [Field in PrdAssistFieldName]: {
    targetField: Field;
    value: PRDDocument[Field];
  };
}[PrdAssistFieldName];

export type PrdSectionAssistResult = {
  answer: string | null;
  proposal: PrdSectionAssistProposal | null;
  clarifyingQuestion: string | null;
  citedMessageIds: string[];
  citedEvidenceIds: string[];
  assumptions: string[];
  suggestedNextQuestions: string[];
};

export function parsePrdSectionAssistance(
  scope: PrdAssistScope,
  result: unknown,
): { ok: true; value: PrdSectionAssistResult } | { ok: false } {
  const parsedScope = PrdAssistScopeSchema.safeParse(scope);
  if (!parsedScope.success) return { ok: false };

  const envelope = PrdSectionAssistEnvelopeSchema.safeParse(result);
  if (!envelope.success) return { ok: false };
  const { answer, clarifyingQuestion, proposal } = envelope.data;

  if (clarifyingQuestion !== null && (answer !== null || proposal !== null)) {
    return { ok: false };
  }
  if (answer === null && clarifyingQuestion === null && proposal === null) {
    return { ok: false };
  }

  let parsedProposal: PrdSectionAssistProposal | null = null;
  if (proposal !== null) {
    if (!parsedScope.data.canProposeEdit) return { ok: false };

    const section = parsedScope.data.sections.find(
      ({ field }) => field === proposal.targetField,
    );
    if (!section) return { ok: false };

    const value = parsePrdFieldValue(section.field, proposal.value);
    if (!value.ok) return { ok: false };

    // `parsePrdFieldValue` validated `value` against `section.field`'s own
    // schema; the union above cannot express that correspondence generically.
    parsedProposal = {
      targetField: section.field,
      value: value.value,
    } as PrdSectionAssistProposal;
  }

  return {
    ok: true,
    value: {
      answer,
      proposal: parsedProposal,
      clarifyingQuestion,
      citedMessageIds: envelope.data.citedMessageIds,
      citedEvidenceIds: envelope.data.citedEvidenceIds,
      assumptions: envelope.data.assumptions,
      suggestedNextQuestions: envelope.data.suggestedNextQuestions,
    },
  };
}
