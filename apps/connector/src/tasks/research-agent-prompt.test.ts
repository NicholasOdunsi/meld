import { describe, expect, it } from "vitest";
import {
  RESEARCH_AGENT_ROOM_PROMPT_VERSION,
  RESEARCH_AGENT_ROOM_SYSTEM_PROMPT,
  RESEARCH_AGENT_WEB_PROMPT_VERSION,
  RESEARCH_AGENT_WEB_SYSTEM_PROMPT,
  researchAgentPromptVersion,
  researchAgentSystemPrompt,
  researchRoomReplyResponseSchema,
} from "./research-agent-prompt";

describe("Research Agent prompt", () => {
  it("keeps room-only research offline", () => {
    expect(researchAgentPromptVersion("room")).toBe(
      RESEARCH_AGENT_ROOM_PROMPT_VERSION,
    );
    expect(researchAgentSystemPrompt("room")).toBe(
      RESEARCH_AGENT_ROOM_SYSTEM_PROMPT,
    );
    expect(RESEARCH_AGENT_ROOM_SYSTEM_PROMPT).toContain(
      "Work only from the supplied room context",
    );
    expect(RESEARCH_AGENT_ROOM_SYSTEM_PROMPT).toContain(
      "Set webSources to []",
    );
  });

  it("limits web research to search and page retrieval", () => {
    expect(researchAgentPromptVersion("web")).toBe(
      RESEARCH_AGENT_WEB_PROMPT_VERSION,
    );
    expect(researchAgentSystemPrompt("web")).toBe(
      RESEARCH_AGENT_WEB_SYSTEM_PROMPT,
    );
    expect(RESEARCH_AGENT_WEB_SYSTEM_PROMPT).toContain(
      "only web search and web page retrieval tools",
    );
    expect(RESEARCH_AGENT_WEB_SYSTEM_PROMPT).toContain(
      "Keep private room content out of search queries",
    );
    expect(RESEARCH_AGENT_WEB_SYSTEM_PROMPT).toContain(
      "Every external factual claim",
    );
    expect(RESEARCH_AGENT_WEB_SYSTEM_PROMPT).toContain(
      "Set proposedAction to null",
    );
  });

  it("requires Claude web replies to return their source list", () => {
    const webSchema = researchRoomReplyResponseSchema("claude", "web");
    expect(webSchema.required).toEqual(["response", "webSources"]);
    expect(researchRoomReplyResponseSchema("claude", "room").required).toEqual(
      ["response"],
    );
    expect(webSchema.properties.proposedAction.description).toContain(
      "always send null",
    );
  });
});
