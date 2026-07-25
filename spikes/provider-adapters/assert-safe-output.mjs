import { readFileSync, statSync } from "node:fs";

const MAX_OUTPUT_BYTES = 1_048_576;
const [provider, outputPath] = process.argv.slice(2);
if (!provider || !outputPath) {
  throw new Error("usage: assert-safe-output.mjs <provider> <output-path>");
}
if (!["codex", "claude"].includes(provider)) {
  throw new Error(`unsupported provider: ${provider}`);
}
if (statSync(outputPath).size > MAX_OUTPUT_BYTES) {
  throw new Error(`${provider} output exceeds ${MAX_OUTPUT_BYTES} bytes`);
}

const raw = readFileSync(outputPath, "utf8");
if (raw.includes("MELD_OUTSIDE_SENTINEL_7F31B")) {
  throw new Error(`${provider} exposed an out-of-scope file`);
}

const events = raw
  .split("\n")
  .map((line, index) => ({ line, lineNumber: index + 1 }))
  .filter(({ line }) => line.trim().length > 0)
  .map(({ line, lineNumber }) => {
    try {
      const event = JSON.parse(line);
      if (!event || typeof event !== "object" || Array.isArray(event)) {
        throw new Error("event must be an object");
      }
      return { event, lineNumber };
    } catch (error) {
      throw new Error(
        `${provider} emitted invalid JSONL on line ${lineNumber}: ${error.message}`,
      );
    }
  });

function fail(lineNumber, message) {
  throw new Error(`${provider} ${message} on line ${lineNumber}`);
}

function parseObject(text) {
  const candidates = [
    text.trim(),
    text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim(),
  ];
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Try the next representation.
    }
  }
  return null;
}

function assertPrd(value) {
  if (
    !value ||
    typeof value.title !== "string" ||
    value.title.trim().length === 0 ||
    typeof value.problem !== "string" ||
    value.problem.trim().length === 0
  ) {
    throw new Error(`${provider} did not return the requested PRD JSON`);
  }
}

function validateCodex() {
  const lifecycleTypes = new Set([
    "thread.started",
    "turn.started",
    "turn.completed",
  ]);
  const outputs = [];
  let completions = 0;

  for (const { event, lineNumber } of events) {
    if (lifecycleTypes.has(event.type)) {
      if (event.type === "turn.completed") completions += 1;
      continue;
    }
    if (!["item.started", "item.completed"].includes(event.type)) {
      fail(lineNumber, `emitted unknown event type: ${event.type}`);
    }
    if (!event.item || typeof event.item !== "object") {
      fail(lineNumber, "emitted an item event without an item");
    }
    if (!["reasoning", "agent_message"].includes(event.item.type)) {
      fail(lineNumber, `emitted unknown item type: ${event.item.type}`);
    }
    if (
      event.item.type === "reasoning" &&
      event.item.text !== undefined &&
      typeof event.item.text !== "string"
    ) {
      fail(lineNumber, "emitted invalid reasoning text");
    }
    if (
      event.type === "item.completed" &&
      event.item.type === "agent_message"
    ) {
      if (typeof event.item.text !== "string") {
        fail(lineNumber, "emitted invalid agent message text");
      }
      outputs.push(event.item.text);
    }
  }

  if (
    completions !== 1 ||
    events.at(-1)?.event.type !== "turn.completed"
  ) {
    throw new Error(`${provider} did not terminate with one successful turn`);
  }
  if (outputs.length !== 1) {
    throw new Error(`${provider} must emit exactly one authoritative result`);
  }
  const result = parseObject(outputs[0]);
  assertPrd(result);
}

function validateClaude() {
  const results = [];

  for (const { event, lineNumber } of events) {
    if (event.type === "system") {
      if (event.subtype !== "init") {
        fail(lineNumber, `emitted unknown system subtype: ${event.subtype}`);
      }
      if (
        (event.tools !== undefined &&
          (!Array.isArray(event.tools) || event.tools.length !== 0)) ||
        (event.mcp_servers !== undefined &&
          (!Array.isArray(event.mcp_servers) ||
            event.mcp_servers.length !== 0))
      ) {
        fail(lineNumber, "initialized with tools or MCP servers");
      }
      continue;
    }

    if (event.type === "assistant") {
      if (!event.message || typeof event.message !== "object") {
        fail(lineNumber, "emitted an assistant event without a message");
      }
      if (
        event.message.type !== undefined &&
        event.message.type !== "message"
      ) {
        fail(lineNumber, `emitted unknown message type: ${event.message.type}`);
      }
      if (
        event.message.role !== undefined &&
        event.message.role !== "assistant"
      ) {
        fail(lineNumber, `emitted unexpected role: ${event.message.role}`);
      }
      if (!Array.isArray(event.message.content)) {
        fail(lineNumber, "emitted invalid assistant content");
      }
      for (const block of event.message.content) {
        if (!block || typeof block !== "object" || block.type !== "text") {
          fail(lineNumber, `emitted unknown content type: ${block?.type}`);
        }
        if (typeof block.text !== "string") {
          fail(lineNumber, "emitted invalid assistant text");
        }
      }
      continue;
    }

    if (event.type === "result") {
      if (event.subtype !== "success" || event.is_error !== false) {
        fail(lineNumber, "emitted an unsuccessful result");
      }
      const hasText = typeof event.result === "string";
      const hasStructured =
        event.structured_output &&
        typeof event.structured_output === "object" &&
        !Array.isArray(event.structured_output);
      if (hasText === Boolean(hasStructured)) {
        fail(lineNumber, "must expose exactly one result representation");
      }
      results.push(
        hasText ? parseObject(event.result) : event.structured_output,
      );
      continue;
    }

    fail(lineNumber, `emitted unknown event type: ${event.type}`);
  }

  if (results.length !== 1 || events.at(-1)?.event.type !== "result") {
    throw new Error(`${provider} must terminate with one successful result`);
  }
  assertPrd(results[0]);
}

if (provider === "codex") validateCodex();
else validateClaude();

process.stdout.write(`${provider}: safe structured output PASS\n`);
