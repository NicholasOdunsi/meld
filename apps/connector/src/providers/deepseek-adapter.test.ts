import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeepSeekAdapter } from "./deepseek-adapter";
import type { ProviderAdapterRequest } from "./provider-adapter";

const ITEM = "00000000-0000-4000-8000-000000000001";
const BOARD = {
  screens: [
    {
      screenKey: "login",
      name: "Log In",
      formFactor: "mobile" as const,
      markup: "<main><h1>Log in</h1></main>",
      styles: "main{padding:16px}",
      script: null,
      actions: [],
      layout: null,
    },
  ],
};

async function request(
  over: Partial<ProviderAdapterRequest> = {},
): Promise<ProviderAdapterRequest> {
  const directory = await mkdtemp(path.join(tmpdir(), "meld-deepseek-"));
  const responseSchemaFile = path.join(directory, "response-schema.json");
  await writeFile(
    responseSchemaFile,
    JSON.stringify({
      type: "object",
      additionalProperties: false,
      required: ["screens"],
      properties: { screens: { type: "array" } },
    }),
  );
  return {
    workspace: {
      directory,
      contextFile: path.join(directory, "context.json"),
      responseSchemaFile,
      mcpConfigFile: path.join(directory, "mcp.json"),
      dispose: async () => undefined,
    },
    prompt: "a phone login screen",
    systemPrompt: "You generate screens.",
    manifest: {
      messageIds: new Set(),
      attachmentIds: new Set(),
      evidenceIds: new Set([ITEM]),
      decisionIds: new Set(),
    },
    kind: "design_screen_generate",
    ...over,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createDeepSeekAdapter", () => {
  it("returns a validated design batch from DeepSeek JSON", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify(BOARD) } }],
      }),
    );
    const events = await createDeepSeekAdapter({ apiKey: "sk-test", fetch }).run(
      await request(),
    );
    expect(events.at(-1)).toMatchObject({ type: "completed", result: BOARD });
    const body = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.model).toBe("deepseek-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("requires an API key", async () => {
    const events = await createDeepSeekAdapter({ apiKey: "" }).run(await request());
    expect(events).toEqual([
      expect.objectContaining({ type: "failed", code: "authentication_required" }),
    ]);
  });

  it("rejects web search", async () => {
    const events = await createDeepSeekAdapter({ apiKey: "sk-test" }).run(
      await request({ webSearch: true }),
    );
    expect(events).toEqual([
      expect.objectContaining({ type: "failed", code: "provider_unavailable" }),
    ]);
  });

  it("maps bad model JSON to malformed_output", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: "not-json" } }] }),
    );
    const events = await createDeepSeekAdapter({ apiKey: "sk-test", fetch }).run(
      await request(),
    );
    expect(events).toEqual([
      expect.objectContaining({ type: "failed", code: "malformed_output" }),
    ]);
  });
});
