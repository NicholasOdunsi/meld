import { z } from "zod";
import { FlowDocumentSchema } from "./user-flow";

// The user-journeys section prefers a structured flow (the same node/edge
// document the User Flows canvas produces) so it can render as an expandable
// preview. But generation and older PRDs still land prose here, so the field
// also accepts a plain string: the reader shows prose as text and a flow as
// the preview. `null` (or empty prose) is the "nothing yet" empty state.
// Keeping prose rather than coercing it away is deliberate -- discarding it
// would silently blank a section the author actually wrote.
export const UserJourneysSchema = z
  .union([FlowDocumentSchema, z.string()])
  .nullable();

export const LegacyPRDDocumentSchema = z.object({
  title: z.string().min(1),
  executiveSummary: z.string(),
  problemAndEvidence: z.string(),
  targetUsersAndUseCases: z.string(),
  goalsNonGoalsAndMetrics: z.string(),
  proposedSolution: z.string(),
  userJourneys: UserJourneysSchema,
  functionalRequirements: z.array(z.string()),
  nonFunctionalRequirements: z.array(z.string()),
  uxStatesAndEdgeCases: z.array(z.string()),
  dependenciesAndConstraints: z.array(z.string()),
  risksAndMitigations: z.array(
    z.object({ risk: z.string(), mitigation: z.string() }),
  ),
  mvpScope: z.object({
    included: z.array(z.string()),
    excluded: z.array(z.string()),
  }),
  acceptanceCriteria: z.array(z.string()),
  openQuestions: z.array(z.string()),
  decisionHistory: z.array(
    z.object({
      decision: z.string(),
      rationale: z.string(),
      sourceMessageIds: z.array(z.string().uuid()),
    }),
  ),
});
export type PRDDocument = z.infer<typeof LegacyPRDDocumentSchema>;

// Structured generation and section-assistance modules read `.shape` from
// this export while the contracts graph is being initialized, so keep the
// compatibility alias beside the legacy schema rather than below the
// freeform schema declarations.
export const PRDDocumentSchema = LegacyPRDDocumentSchema;

const SafeHrefSchema = z
  .string()
  .max(2_048)
  .refine((value) => /^(https?:|mailto:|\/|#)/i.test(value), {
    message: "Unsupported link URL.",
  });

const FreeformMarkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["bold", "italic", "strike", "code"]) }).strict(),
  z
    .object({
      type: z.literal("link"),
      attrs: z
        .object({
          href: SafeHrefSchema,
          target: z.string().max(32).nullable().optional(),
          rel: z.string().max(128).nullable().optional(),
          class: z.string().max(128).nullable().optional(),
        })
        .strict(),
    })
    .strict(),
]);

export type FreeformNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: FreeformNode[];
  marks?: Array<z.infer<typeof FreeformMarkSchema>>;
  text?: string;
};

const FREEFORM_NODE_TYPES = new Set([
  "doc",
  "paragraph",
  "heading",
  "text",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "codeBlock",
  "hardBreak",
  "flowPreview",
]);

const FreeformNodeSchema: z.ZodType<FreeformNode> = z.lazy(() =>
  z
    .object({
      type: z.string().refine((value) => FREEFORM_NODE_TYPES.has(value), {
        message: "Unsupported document node.",
      }),
      attrs: z.record(z.string(), z.unknown()).optional(),
      content: z.array(FreeformNodeSchema).max(2_000).optional(),
      marks: z.array(FreeformMarkSchema).max(8).optional(),
      text: z.string().max(100_000).optional(),
    })
    .strict()
    .superRefine((node, context) => {
      if (node.type === "text" && node.text === undefined) {
        context.addIssue({ code: "custom", message: "Text nodes require text." });
      }
      if (node.type === "heading") {
        const level = node.attrs?.level;
        if (level !== 1 && level !== 2 && level !== 3) {
          context.addIssue({ code: "custom", message: "Unsupported heading level." });
        }
      }
      if (node.type === "taskItem" && typeof node.attrs?.checked !== "boolean") {
        context.addIssue({ code: "custom", message: "Task items require a checked state." });
      }
    }),
);

export const FreeformDocumentSchema = z
  .object({
    format: z.literal("blocks-v1"),
    title: z.string().max(500),
    body: z
      .object({
        type: z.literal("doc"),
        content: z.array(FreeformNodeSchema).max(500).optional(),
      })
      .strict(),
    // Early freeform saves retained the structured journey beside the block
    // document so clients could migrate it into a flowPreview block on read.
    userJourneys: UserJourneysSchema.optional(),
  })
  .strict()
  .superRefine((document, context) => {
    let count = 0;
    const visit = (node: FreeformNode, depth: number) => {
      count += 1;
      if (depth > 12) {
        context.addIssue({ code: "custom", message: "Document nesting is too deep." });
      }
      node.content?.forEach((child) => visit(child, depth + 1));
    };
    for (const [index, node] of (document.body.content ?? []).entries()) {
      if (typeof node.attrs?.meldId !== "string" || node.attrs.meldId.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["body", "content", index, "attrs", "meldId"],
          message: "Top-level blocks require a meldId.",
        });
      }
      visit(node, 1);
    }
    if (count > 2_000) {
      context.addIssue({ code: "custom", message: "Document has too many nodes." });
    }
  });

export type FreeformDocument = z.infer<typeof FreeformDocumentSchema>;
export type StoredPRDDocument = PRDDocument | FreeformDocument;

export const StoredPRDDocumentSchema = z.union([
  FreeformDocumentSchema,
  LegacyPRDDocumentSchema,
]);

export function isFreeformDocument(
  document: StoredPRDDocument,
): document is FreeformDocument {
  return "format" in document && document.format === "blocks-v1";
}
