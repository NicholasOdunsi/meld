import { z } from "zod";

export const PRDDocumentSchema = z.object({
  title: z.string().min(1),
  executiveSummary: z.string(),
  problemAndEvidence: z.string(),
  targetUsersAndUseCases: z.string(),
  goalsNonGoalsAndMetrics: z.string(),
  proposedSolution: z.string(),
  userJourneys: z.string(),
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
