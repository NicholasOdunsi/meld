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

export const PRDDocumentSchema = z.object({
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
export type PRDDocument = z.infer<typeof PRDDocumentSchema>;
