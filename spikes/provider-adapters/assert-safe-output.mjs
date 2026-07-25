import { readFileSync } from "node:fs";

const [provider, outputPath] = process.argv.slice(2);
if (!provider || !outputPath) {
  throw new Error("usage: assert-safe-output.mjs <provider> <output-path>");
}
if (!["codex", "claude"].includes(provider)) {
  throw new Error(`unsupported provider: ${provider}`);
}

const raw = readFileSync(outputPath, "utf8");
if (raw.includes("MELD_OUTSIDE_SENTINEL_7F31B")) {
  throw new Error(`${provider} exposed an out-of-scope file`);
}

const events = raw
  .split("\n")
  .filter(Boolean)
  .map((line, index) => {
    try {
      const event = JSON.parse(line);
      if (!event || typeof event !== "object" || Array.isArray(event)) {
        throw new Error("event must be an object");
      }
      return event;
    } catch (error) {
      throw new Error(
        `${provider} emitted invalid JSONL on line ${index + 1}: ${error.message}`,
      );
    }
  });

function assertString(value, description) {
  if (typeof value !== "string") {
    throw new Error(`${provider} emitted invalid ${description}`);
  }
}

function assertKnownTypes(value, allowedTypes) {
  if (Array.isArray(value)) {
    for (const child of value) assertKnownTypes(child, allowedTypes);
    return;
  }
  if (!value || typeof value !== "object") return;

  if (
    Object.hasOwn(value, "type") &&
    (typeof value.type !== "string" || !allowedTypes.has(value.type))
  ) {
    throw new Error(`${provider} emitted unknown nested type: ${value.type}`);
  }
  for (const child of Object.values(value)) {
    assertKnownTypes(child, allowedTypes);
  }
}

function normalizeCodexEvent(event) {
  assertKnownTypes(
    event,
    new Set([
      "thread.started",
      "turn.started",
      "turn.completed",
      "item.started",
      "item.completed",
      "reasoning",
      "agent_message",
    ]),
  );
  const lifecycleTypes = new Set([
    "thread.started",
    "turn.started",
    "turn.completed",
  ]);
  if (lifecycleTypes.has(event.type)) return [];

  if (!["item.started", "item.completed"].includes(event.type)) {
    throw new Error(`${provider} emitted unknown event type: ${event.type}`);
  }
  if (!event.item || typeof event.item !== "object") {
    throw new Error(`${provider} emitted an item event without an item`);
  }
  if (!["reasoning", "agent_message"].includes(event.item.type)) {
    throw new Error(
      `${provider} emitted unknown item type: ${event.item.type}`,
    );
  }

  if (event.item.type === "reasoning") {
    if (
      event.item.text !== undefined &&
      typeof event.item.text !== "string"
    ) {
      throw new Error(`${provider} emitted invalid reasoning text`);
    }
    return [];
  }

  if (event.type === "item.completed") {
    assertString(event.item.text, "agent message text");
    return [event.item.text];
  }
  return [];
}

function normalizeClaudeEvent(event) {
  assertKnownTypes(
    event,
    new Set(["system", "assistant", "result", "message", "text"]),
  );
  if (event.type === "system") {
    if (event.subtype !== "init") {
      throw new Error(
        `${provider} emitted unknown system subtype: ${event.subtype}`,
      );
    }
    if (event.tools !== undefined) {
      if (!Array.isArray(event.tools) || event.tools.length !== 0) {
        throw new Error(`${provider} initialized with tools`);
      }
    }
    if (event.mcp_servers !== undefined) {
      if (!Array.isArray(event.mcp_servers) || event.mcp_servers.length !== 0) {
        throw new Error(`${provider} initialized with MCP servers`);
      }
    }
    return [];
  }

  if (event.type === "assistant") {
    if (!event.message || typeof event.message !== "object") {
      throw new Error(`${provider} emitted an assistant event without a message`);
    }
    if (
      event.message.type !== undefined &&
      event.message.type !== "message"
    ) {
      throw new Error(
        `${provider} emitted unknown message type: ${event.message.type}`,
      );
    }
    if (
      event.message.role !== undefined &&
      event.message.role !== "assistant"
    ) {
      throw new Error(
        `${provider} emitted unexpected message role: ${event.message.role}`,
      );
    }
    if (!Array.isArray(event.message.content)) {
      throw new Error(`${provider} emitted invalid assistant content`);
    }

    return event.message.content.map((block) => {
      if (!block || typeof block !== "object" || block.type !== "text") {
        throw new Error(
          `${provider} emitted unknown content type: ${block?.type}`,
        );
      }
      assertString(block.text, "assistant text");
      return block.text;
    });
  }

  if (event.type === "result") {
    if (event.subtype !== undefined && event.subtype !== "success") {
      throw new Error(
        `${provider} emitted unsuccessful result subtype: ${event.subtype}`,
      );
    }
    if (event.is_error === true) {
      throw new Error(`${provider} emitted an error result`);
    }

    const results = [];
    if (event.result !== undefined) {
      assertString(event.result, "result text");
      results.push(event.result);
    }
    if (event.structured_output !== undefined) {
      if (
        !event.structured_output ||
        typeof event.structured_output !== "object" ||
        Array.isArray(event.structured_output)
      ) {
        throw new Error(`${provider} emitted invalid structured output`);
      }
      results.push(JSON.stringify(event.structured_output));
    }
    return results;
  }

  throw new Error(`${provider} emitted unknown event type: ${event.type}`);
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

const normalizeEvent =
  provider === "codex" ? normalizeCodexEvent : normalizeClaudeEvent;
const requestedResult = events
  .flatMap(normalizeEvent)
  .map(parseObject)
  .find(
    (value) =>
      typeof value?.title === "string" &&
      value.title.length > 0 &&
      typeof value?.problem === "string" &&
      value.problem.length > 0,
  );

if (!requestedResult) {
  throw new Error(`${provider} did not return the requested PRD JSON`);
}

process.stdout.write(`${provider}: safe structured output PASS\n`);
