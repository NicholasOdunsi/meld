import { describe, expect, it } from "vitest";
import { AGENT_CATALOG, agentCatalogEntry } from "./catalog";
import { DISCOVERY_AGENTS } from "@/features/rooms/components/agent-marker";

describe("agent catalog", () => {
  it("covers the whole cast", () => {
    expect(AGENT_CATALOG.map((agent) => agent.kind)).toEqual([
      "product",
      "research",
      "design",
    ]);
  });

  it("looks an agent up by kind", () => {
    expect(agentCatalogEntry("design").handle).toBe("design-agent");
  });

  it("throws rather than rendering a blank card for an unknown kind", () => {
    expect(() =>
      agentCatalogEntry("marketing" as Parameters<typeof agentCatalogEntry>[0]),
    ).toThrow(/marketing/);
  });

  // The point of the catalog: the console row and the @-mention subtext are
  // the same sentence, from one place, rather than two copies that drift.
  it("feeds the mention picker the same description the console shows", () => {
    expect(DISCOVERY_AGENTS).toEqual(
      AGENT_CATALOG.map((agent) => ({
        id: agent.mentionId,
        kind: agent.kind,
        name: agent.name,
        description: agent.description,
      })),
    );
  });

  it("keeps the mention ids the picker already shipped", () => {
    expect(DISCOVERY_AGENTS.map((agent) => agent.id)).toEqual([
      "agent:product",
      "agent:research",
      "agent:design",
    ]);
  });
});
