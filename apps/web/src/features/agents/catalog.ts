import type { AgentKind } from "@meld/contracts";
import type { MeldAgentSprite } from "@/ui/meld-agent";

/**
 * Everything the app displays *about* an agent, in one place.
 *
 * This used to be split: the description lived in `agent-marker.tsx` (under
 * `features/rooms`, so the console could not reach it without a bad
 * cross-feature import) and the sprite mapping lived in `ui/meld-agent.tsx`.
 * Two surfaces naming the same three agents from two files is how they drift.
 *
 * The cast is closed -- `AgentKindSchema` is a TypeScript enum mirrored by a
 * Postgres enum, and there is no create-agent UI -- so a literal table is the
 * honest shape here, not a registry.
 *
 * On truthfulness: `description` and `abilityText` are claims the product
 * makes about what an agent will do, and each clause is checkable against that
 * agent's system prompt in `apps/connector/src/tasks/`. `quote` is the one
 * invented field. Keep that line.
 */
export type AgentCatalogEntry = {
  kind: AgentKind;
  /** Mention id, e.g. "agent:product". */
  mentionId: string;
  /** Title Case, for the room roster and the mention picker. */
  name: string;
  /** The lowercase handle the console shows and `@` expects. */
  handle: string;
  /** One short line of what it does. The console row and the mention subtext share it. */
  description: string;
  sprite: MeldAgentSprite;
  /** Two words, set in the pixel face on the card. */
  ability: string;
  /** The full capability, one sentence. Every clause must be true. */
  abilityText: string;
  /** Voice, not capability -- the only invented string on the card. */
  quote: string;
};

/**
 * Order is the mention picker's order, which shipped before the console did.
 * The console orders its own rows; see `TEAMMATE_ORDER` in the workspace page.
 */
export const AGENT_CATALOG = [
  {
    kind: "product",
    mentionId: "agent:product",
    name: "Product Agent",
    handle: "product-agent",
    description: "Answers product questions from the room",
    sprite: "pink-stretch",
    ability: "ROOM ANSWERS",
    // product-agent-prompt.ts:9 -- answers from room context, and offers a PRD
    // through proposedAction rather than writing one itself.
    abilityText:
      "Answers product questions from the room, and offers to draft a PRD.",
    quote: "“I’ll give you the answer, not the process.”",
  },
  {
    kind: "research",
    mentionId: "agent:research",
    name: "Research Agent",
    handle: "research-agent",
    description: "Finds and synthesizes research",
    sprite: "lime-squat",
    ability: "EVIDENCE SWEEP",
    // research-agent-prompt.ts:7 -- ResearchScope is "room" | "web", and the
    // web prompt is the one allowed to search.
    abilityText:
      "Finds and synthesizes research — in the room, or on the open web.",
    quote: "“That’s an interpretation, not a finding.”",
  },
  {
    kind: "design",
    mentionId: "agent:design",
    name: "Design Agent",
    handle: "design-agent",
    description: "Generates and previews screens",
    sprite: "purple-pocket",
    ability: "SCREEN BATCH",
    // design-screen-generate-prompt.ts:12 -- a BATCH of screens, built against
    // the supplied var(--ds-*) tokens. That is the *user's* design system, not
    // Meld's; saying "the Meld design system" here would be a false claim.
    abilityText:
      "Generates clickable screens — a batch at a time, in your design system.",
    quote: "“Give me the flow. I’ll give you screens.”",
  },
] as const satisfies readonly AgentCatalogEntry[];

export type AgentCatalogKind = (typeof AGENT_CATALOG)[number]["kind"];

export function agentCatalogEntry(kind: AgentKind): AgentCatalogEntry {
  const entry = AGENT_CATALOG.find((candidate) => candidate.kind === kind);
  if (!entry) {
    throw new Error(`No catalog entry for agent kind "${kind}"`);
  }
  return entry;
}
