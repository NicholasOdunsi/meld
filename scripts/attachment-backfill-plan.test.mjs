import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isBackfillCandidate,
  planRow,
  restoredCharacters,
  summarize,
} from "./attachment-backfill-plan.mjs";

// Stands in for the extractor's exported DECODED_TEXT_MIME_TYPES. The runner
// passes the real set; these tests only need something with the same shape.
const DECODED = new Set([
  "text/html",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

function row(overrides = {}) {
  return {
    id: "a0000000-0000-4000-8000-000000000001",
    mime_type: "text/markdown",
    extraction_status: "ready",
    extracted_text: "Dont ship  its not ready",
    ...overrides,
  };
}

test("restores a row whose smart punctuation was stripped", () => {
  const next = "Don’t ship — it’s not ready…";
  const decision = planRow(row(), next, DECODED);

  assert.equal(decision.kind, "restore");
  assert.equal(decision.nextText, next);
  // The report names what comes back, so a reviewer can see this is a
  // restoration and not a rewrite.
  assert.deepEqual(decision.restored.sort(), ["—", "…", "’"].sort());
});

test("leaves an undamaged row alone", () => {
  const text = "Already clean, no C1 bytes here.";
  const decision = planRow(row({ extracted_text: text }), text, DECODED);

  assert.equal(decision.kind, "unchanged");
});

test("skips PDFs and images, which never reached the decoder", () => {
  // PDFs go through unpdf and images carry a caption; neither could have been
  // damaged by the windows-1252 bug, so the backfill must not rewrite them.
  for (const mime of ["application/pdf", "image/png", "image/jpeg"]) {
    const decision = planRow(row({ mime_type: mime }), "anything at all", DECODED);
    assert.equal(decision.kind, "skip", mime);
  }
});

test("treats text/html as a candidate", () => {
  // Regression: an earlier draft hardcoded {text/plain, text/markdown} and so
  // skipped every text/html row -- which is the type most affected in
  // practice, because exported HTML is where the windows-1252 bytes turn up.
  // The runner now passes the extractor's own set, and this pins the outcome.
  const decision = planRow(
    row({ mime_type: "text/html", extracted_text: "Its" }),
    "It\u2019s",
    DECODED,
  );

  assert.equal(decision.kind, "restore");
  assert.deepEqual(decision.restored, ["\u2019"]);
});

test("skips rows that are not ready", () => {
  const decision = planRow(
    row({ extraction_status: "unsupported", extracted_text: null }),
    "text",
    DECODED,
  );
  assert.equal(decision.kind, "skip");
});

test("refuses to write null over a ready row", () => {
  // The table's check constraint requires ready rows to hold non-null text,
  // so writing null would fail -- and would mean something changed beyond the
  // bug this backfill repairs.
  const decision = planRow(row(), null, DECODED);

  assert.equal(decision.kind, "skip");
  assert.match(decision.reason, /manual review/);
});

test("refuses to shrink stored text", () => {
  // A restore only ever adds characters back. Anything shorter is a different
  // problem, and silently truncating someone's extracted context would be far
  // worse than leaving the row for a human.
  const decision = planRow(
    row({ extracted_text: "a much longer body of text than the new one" }),
    "short",
    DECODED,
  );

  assert.equal(decision.kind, "skip");
  assert.match(decision.reason, /shorter/);
});

test("does not claim recovery for characters that were already present", () => {
  const stored = "Kept — dash";
  const next = "Kept — dash…";

  assert.deepEqual(restoredCharacters(stored, next), ["…"]);
});

test("identifies candidates by status and mime type together", () => {
  assert.equal(isBackfillCandidate(row(), DECODED), true);
  assert.equal(
    isBackfillCandidate(row({ mime_type: "application/pdf" }), DECODED),
    false,
  );
  assert.equal(
    isBackfillCandidate(row({ extraction_status: "pending" }), DECODED),
    false,
  );
});

test("summarizes a mixed run", () => {
  const summary = summarize([
    { kind: "restore" },
    { kind: "restore" },
    { kind: "unchanged" },
    { kind: "skip", reason: "x" },
  ]);

  assert.deepEqual(summary, {
    scanned: 4,
    unchanged: 1,
    restore: 2,
    skip: 1,
  });
});
