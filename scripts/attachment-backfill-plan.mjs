// Pure decision logic for the windows-1252 extracted-text backfill.
//
// Split out from the runner so the part that decides whether a row is damaged
// can be tested without a database, a storage bucket, or a service-role key.
// The runner does I/O; this module does judgement.
//
// Background: extraction runs once at upload and the result is persisted to
// public.attachments.extracted_text. On Node 20, TextDecoder("windows-1252")
// passed the C1 bytes through unmapped (0x92 -> U+0092 rather than U+2019),
// and the extractor's control-character strip then deleted them. Every smart
// quote, dash, ellipsis and bullet in a non-UTF-8 text upload was silently
// dropped. Node 22 decodes correctly, so re-extracting the retained original
// bytes recovers the lost characters.

// Which mime types could have been damaged is NOT decided here. The runner
// passes in DECODED_TEXT_MIME_TYPES, exported by the extractor itself, so this
// list can never drift from the code that actually runs the decoder.
//
// An earlier draft of this module kept its own hardcoded copy and omitted
// text/html -- which turned out to be the type every affected row in practice
// used. The bug was invisible until the script ran against real data and
// reported zero candidates. Deriving the set removes that whole class of
// mistake; PDFs (unpdf) and images (caption only) are excluded by construction
// because they never reach the decoder.

// The windows-1252 code points the old strip deleted. Used only to describe
// what a restore recovers -- the decision itself is a plain text comparison,
// so a difference from any other cause is still caught.
const RECOVERABLE_CHARACTERS = new Set([
  "€", "‚", "ƒ", "„", "…", "†", "‡",
  "ˆ", "‰", "Š", "‹", "Œ", "Ž", "‘",
  "’", "“", "”", "•", "–", "—", "˜",
  "™", "š", "›", "œ", "ž", "Ÿ",
]);

export function isBackfillCandidate(row, decodedMimeTypes) {
  return (
    row.extraction_status === "ready" &&
    decodedMimeTypes.has(row.mime_type)
  );
}

// Characters present in the re-extracted text but absent from what is stored.
// These are what the row would regain, and they are what the dry run reports
// so a reviewer can see the change is a restoration rather than a rewrite.
export function restoredCharacters(storedText, nextText) {
  const present = new Set(storedText);
  const restored = new Set();
  for (const character of nextText) {
    if (!present.has(character) && RECOVERABLE_CHARACTERS.has(character)) {
      restored.add(character);
    }
  }
  return [...restored];
}

/**
 * Decide what to do with one attachment row.
 *
 * @param {{id: string, mime_type: string, extraction_status: string, extracted_text: string|null}} row
 * @param {string|null} nextText result of re-running the extractor on the original bytes
 * @param {ReadonlySet<string>} decodedMimeTypes the extractor's DECODED_TEXT_MIME_TYPES
 */
export function planRow(row, nextText, decodedMimeTypes) {
  if (!isBackfillCandidate(row, decodedMimeTypes)) {
    return { kind: "skip", reason: "not a ready decoded-text attachment" };
  }

  // A ready row is required by a table check constraint to hold non-null text.
  // If re-extraction now yields nothing, writing it would violate that
  // constraint -- and it means something changed beyond this bug, so the row
  // wants a human rather than an automated overwrite.
  if (nextText === null || nextText === "") {
    return {
      kind: "skip",
      reason: "re-extraction produced no text; needs manual review",
    };
  }

  if (nextText === row.extracted_text) {
    return { kind: "unchanged" };
  }

  // A restore should only ever add characters back. If the new text is shorter
  // than what is stored, this is not the damage we are repairing, so leave it
  // alone and surface it instead of quietly shrinking someone's data.
  if (
    row.extracted_text !== null &&
    nextText.length < row.extracted_text.length
  ) {
    return {
      kind: "skip",
      reason: "re-extraction is shorter than stored text; needs manual review",
    };
  }

  return {
    kind: "restore",
    nextText,
    restored: restoredCharacters(row.extracted_text ?? "", nextText),
  };
}

export function summarize(decisions) {
  const summary = { scanned: 0, unchanged: 0, restore: 0, skip: 0 };
  for (const decision of decisions) {
    summary.scanned += 1;
    summary[decision.kind === "restore" ? "restore" : decision.kind] += 1;
  }
  return summary;
}
