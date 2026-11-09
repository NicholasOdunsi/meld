import { describe, expect, it, vi } from "vitest";
import { createDeepSeekTodoWriter, TODO_SYSTEM_PROMPT, TodoWriterError } from "./deepseek-todo-writer";

describe("TODO_SYSTEM_PROMPT", () => {
  it("asks for a little context without long paragraphs", () => {
    expect(TODO_SYSTEM_PROMPT).toContain("a little context");
    expect(TODO_SYSTEM_PROMPT).toContain("not a bare verb, not a paragraph");
    expect(TODO_SYSTEM_PROMPT).toContain("under 160 characters");
    expect(TODO_SYSTEM_PROMPT).toContain("Too thin");
    expect(TODO_SYSTEM_PROMPT).toContain("Too much");
  });
});

function reply(content: unknown, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] }), { status });
}

describe("createDeepSeekTodoWriter", () => {
  it("sends the brief and parses summary + todos", async () => {
    const fetch = vi.fn().mockResolvedValue(reply({ summary: "S", todos: ["Draft pricing"] }));
    const writer = createDeepSeekTodoWriter({ apiKey: "k", model: "deepseek-flash", fetch });
    await expect(writer.write("brief text")).resolves.toEqual({ summary: "S", todos: ["Draft pricing"] });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: "deepseek-flash", temperature: 0.2, response_format: { type: "json_object" } });
    expect(body.messages[0]).toEqual({ role: "system", content: TODO_SYSTEM_PROMPT });
    expect(body.messages[1]).toEqual({ role: "user", content: "brief text" });
    expect(init.headers.Authorization).toBe("Bearer k");
  });

  it.each([
    ["http", () => new Response("no", { status: 500 })],
    ["bad_json", () => reply("not json")],
    ["invalid_response", () => reply({ todos: "nope" })],
  ])("throws %s", async (code, make) => {
    const writer = createDeepSeekTodoWriter({ apiKey: "k", model: "m", fetch: vi.fn().mockResolvedValue(make()) });
    await expect(writer.write("b")).rejects.toMatchObject({ code });
  });

  it("maps a timeout", async () => {
    const fetch = vi.fn().mockRejectedValue(new DOMException("t", "TimeoutError"));
    const writer = createDeepSeekTodoWriter({ apiKey: "k", model: "m", fetch });
    await expect(writer.write("b")).rejects.toBeInstanceOf(TodoWriterError);
    await expect(writer.write("b")).rejects.toMatchObject({ code: "timeout" });
  });
});
