import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import {
  classifyAuthentication,
  extractStructured,
  makeFakeProvider,
  run,
  runProvider,
} from "./live-smoke.mjs";

const temporaryDirectories = [];

async function temporaryRoot() {
  const directory = await mkdtemp(path.join(tmpdir(), "meld-live-smoke-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

/** Runs `body` while collecting everything written to stdout. */
async function captureStdout(body) {
  const original = process.stdout.write.bind(process.stdout);
  let captured = "";
  process.stdout.write = (chunk, ...rest) => {
    captured += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    return original(chunk, ...rest);
  };
  try {
    await body();
  } finally {
    process.stdout.write = original;
  }
  return captured;
}

after(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

test("the self-test drives both fake providers to a pass", async () => {
  const { code } = await run(["--self-test"]);
  assert.equal(code, 0);
});

test("no arguments print usage and exit 64", async () => {
  const { code } = await run([]);
  assert.equal(code, 64);
});

test("an unsupported live provider exits 64", async () => {
  const { code } = await run(["--live", "gemini"], {
    MELD_LIVE_PROVIDER_ACCEPTANCE: "1",
  });
  assert.equal(code, 64);
});

test("live mode refuses without the acceptance flag", async () => {
  const { code } = await run(["--live", "codex"], {
    MELD_CODEX_HOME: "/managed/home",
    MELD_CODEX_BIN: "/managed/bin/codex",
  });
  assert.equal(code, 67);
});

test("live mode refuses without an isolated managed home and binary", async () => {
  const { code } = await run(["--live", "claude"], {
    MELD_LIVE_PROVIDER_ACCEPTANCE: "1",
  });
  assert.equal(code, 67);
});

test("the pipeline prints only stage and result status", async () => {
  const root = await temporaryRoot();
  const { home, binary } = await makeFakeProvider("codex", root);

  const output = await captureStdout(() =>
    runProvider({ provider: "codex", home, binary }),
  );

  const lines = output.split("\n").filter((line) => line.length > 0);
  for (const line of lines) {
    assert.ok(
      /^stage: [a-z_]+ ok$/.test(line) || line === "codex live smoke PASS",
      `unexpected harness output line: ${line}`,
    );
  }
  // Never the prompt, and never the provider's own answer.
  assert.ok(!output.includes("Return a JSON object"));
  assert.ok(!output.includes("acknowledged"));
});

test("extractStructured reads each provider's schema-bound payload", () => {
  const codex = extractStructured(
    "codex",
    [
      '{"type":"thread.started"}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"answer\\":\\"ok\\"}"}}',
    ].join("\n"),
    false,
  );
  assert.deepEqual(codex, { answer: "ok" });

  const claude = extractStructured(
    "claude",
    [
      '{"type":"system","subtype":"init"}',
      '{"type":"result","subtype":"success","is_error":false,"structured_output":{"answer":"ok"}}',
    ].join("\n"),
    false,
  );
  assert.deepEqual(claude, { answer: "ok" });
});

test("classifyAuthentication rejects non-subscription authentication", () => {
  assert.throws(() =>
    classifyAuthentication("codex", 0, "Logged in using an API key"),
  );
  assert.throws(() =>
    classifyAuthentication(
      "claude",
      0,
      '{"loggedIn":true,"authMethod":"api_key"}',
    ),
  );
  // A genuine subscription session is accepted.
  assert.doesNotThrow(() =>
    classifyAuthentication("codex", 0, "Logged in using ChatGPT"),
  );
  assert.doesNotThrow(() =>
    classifyAuthentication(
      "claude",
      0,
      '{"loggedIn":true,"authMethod":"subscription"}',
    ),
  );
});
