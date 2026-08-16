import { z } from "zod";
import { FlowDocumentSchema } from "./user-flow";

export const MAX_FLOW_ASSIST_CLARIFY_CHARS = 2000;

/**
 * One user_flow_assist result. The Product Agent either returns a whole updated
 * flow OR asks one clarifying question -- never both, never neither. The graph
 * invariants ride in through FlowDocumentSchema, identical to generation.
 */
export const UserFlowAssistEnvelopeSchema = z
  .object({
    flow: FlowDocumentSchema.nullable(),
    clarifyingQuestion: z
      .string()
      .trim()
      .min(1)
      .max(MAX_FLOW_ASSIST_CLARIFY_CHARS)
      .nullable(),
  })
  .strict()
  .refine((value) => (value.flow === null) !== (value.clarifyingQuestion === null), {
    message: "Return exactly one of flow or clarifyingQuestion.",
  });

export type UserFlowAssistEnvelope = z.infer<typeof UserFlowAssistEnvelopeSchema>;
