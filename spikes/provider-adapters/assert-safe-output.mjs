import { readFileSync } from "node:fs";

const [provider, outputPath] = process.argv.slice(2);
if (!provider || !outputPath) {
  throw new Error("usage: assert-safe-output.mjs <provider> <output-path>");
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
      return JSON.parse(line);
    } catch (error) {
      throw new Error(
        `${provider} emitted invalid JSONL on line ${index + 1}: ${error.message}`,
      );
    }
  });

const forbiddenTypes = new Set([
  "command_execution",
  "file_change",
  "file_read",
  "mcp_tool_call",
  "tool_result",
  "tool_use",
  "web_search",
]);

function findForbiddenType(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenType(item);
      if (found) return found;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;
  if (typeof value.type === "string" && forbiddenTypes.has(value.type)) {
    return value.type;
  }

  for (const child of Object.values(value)) {
    const found = findForbiddenType(child);
    if (found) return found;
  }
  return null;
}

for (const event of events) {
  const forbiddenType = findForbiddenType(event);
  if (forbiddenType) {
    throw new Error(
      `${provider} emitted forbidden tool event: ${forbiddenType}`,
    );
  }
}

function textResults(event) {
  const results = [];

  if (
    event.type === "item.completed" &&
    event.item?.type === "agent_message" &&
    typeof event.item.text === "string"
  ) {
    results.push(event.item.text);
  }

  if (event.type === "assistant" && Array.isArray(event.message?.content)) {
    for (const block of event.message.content) {
      if (block?.type === "text" && typeof block.text === "string") {
        results.push(block.text);
      }
    }
  }

  if (event.type === "result") {
    if (typeof event.result === "string") results.push(event.result);
    if (event.structured_output) {
      results.push(JSON.stringify(event.structured_output));
    }
  }

  return results;
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

const requestedResult = events
  .flatMap(textResults)
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
