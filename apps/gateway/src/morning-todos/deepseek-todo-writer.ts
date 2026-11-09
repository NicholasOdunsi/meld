import { MorningTodosOutputSchema, type MorningTodosOutput } from "@meld/contracts";

export const DEEPSEEK_TODO_DEFAULT_MODEL = "deepseek-flash";
const ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_TIMEOUT_MS = 30_000;

export const TODO_SYSTEM_PROMPT = [
  "You help a solo founder start their day. You get one project's running summary and what changed since yesterday.",
  "Return JSON: {\"summary\": string, \"todos\": string[]}.",
  "summary: a fresh, plain description of where the project stands, at most 400 words, replacing the old one.",
  "todos: at most 5 things the founder should pick up today, written the way they would write their own to-do:",
  "short, imperative, one action each, under 120 characters, no project name, no numbering, no emoji.",
  "Good examples: \"Update the user flow for sign-up\", \"Answer Orion's question about pricing tiers\", \"Retry the PRD that failed\".",
  "Only include things that are clearly still open. Never repeat or rephrase a to-do listed as already on the list.",
  "If nothing needs the founder, return an empty todos list.",
].join("\n");

export type TodoWriter = { model: string; write(brief: string): Promise<MorningTodosOutput> };
export type TodoWriterErrorCode = "network" | "timeout" | "http" | "bad_json" | "invalid_response";

export class TodoWriterError extends Error {
  constructor(readonly code: TodoWriterErrorCode) {
    super(`Morning to-do writing failed: ${code}`);
    this.name = "TodoWriterError";
  }
}

export function createDeepSeekTodoWriter({
  apiKey,
  model,
  fetch = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  apiKey: string;
  model: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}): TodoWriter {
  return {
    model,
    async write(brief) {
      let response: Response;
      try {
        response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: TODO_SYSTEM_PROMPT },
              { role: "user", content: brief },
            ],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const isTimeout = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
        throw new TodoWriterError(isTimeout ? "timeout" : "network");
      }
      if (!response.ok) throw new TodoWriterError("http");
      let parsed: unknown;
      try {
        const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
        const content = body.choices?.[0]?.message?.content;
        parsed = JSON.parse(typeof content === "string" ? content : "");
      } catch {
        throw new TodoWriterError("bad_json");
      }
      const result = MorningTodosOutputSchema.safeParse(parsed);
      if (!result.success) throw new TodoWriterError("invalid_response");
      return result.data;
    },
  };
}
