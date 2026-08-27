import { readOoxmlParts, OoxmlArchiveError } from "./ooxml-archive";

// Text out of Word and PowerPoint files, which arrive as archives an untrusted
// person chose the contents of.
//
// Deliberately no XML parser. OOXML parts are XML, and every general-purpose
// parser has an entity-expansion story -- XXE, billion laughs -- that has to be
// configured off correctly and stays one dependency upgrade away from being on
// again. Matching the handful of text elements with a regex cannot resolve an
// entity, cannot open a file, and cannot make a network call, because it has no
// mechanism to do any of those things. A document that declares entities at all
// is refused outright rather than partially read.

const DOCX_BODY = "word/document.xml";
const PPTX_SLIDE = /^ppt\/slides\/slide(\d+)\.xml$/;

/** `<w:t>` in Word, `<a:t>` in PowerPoint: the leaf elements holding run text. */
const WORD_RUN_TEXT = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
const SLIDE_RUN_TEXT = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
/** Paragraph and line breaks, so separate blocks do not run together. */
const WORD_BREAK = /<\/w:p>|<w:br\b[^>]*\/?>/g;
const SLIDE_BREAK = /<\/a:p>|<a:br\b[^>]*\/?>/g;

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export class OoxmlTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OoxmlTextError";
  }
}

// A DOCTYPE has no legitimate place in an OOXML part. Its only uses here are
// entity expansion attacks, so its presence is treated as intent rather than
// something to strip and carry on from.
function assertNoDoctype(xml: string, kind: string) {
  if (/<!DOCTYPE/i.test(xml) || /<!ENTITY/i.test(xml)) {
    throw new OoxmlTextError(
      `This ${kind} declares XML entities, which are not supported.`,
    );
  }
}

// Only the five predefined entities and numeric references. An unknown named
// entity resolves to nothing, because resolving it would mean honouring a
// definition from the document itself.
function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code = body.startsWith("#x") || body.startsWith("#X")
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return "";
      try {
        return String.fromCodePoint(code);
      } catch {
        return "";
      }
    }
    return XML_ENTITIES[body] ?? "";
  });
}

// Extracted text is written to attachments.extracted_text. Postgres rejects NUL
// in a text value outright, so a document carrying one would fail the insert
// rather than the file -- the upload would break for a reason nothing in the
// error would explain. Other C0 control characters are stripped for the same
// reason they are not text: nothing downstream wants them.
function toStorableText(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex -- stripping controls is the point
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function runTextFrom(
  xml: string,
  runPattern: RegExp,
  breakPattern: RegExp,
): string {
  // Split on block boundaries first, then read the runs inside each block. The
  // boundary is not adjacent to the run that precedes it -- closing tags sit in
  // between -- so looking just past a run for a break misses it and welds two
  // paragraphs into one word.
  return xml
    .split(breakPattern)
    .map((block) =>
      [...block.matchAll(runPattern)]
        .map((match) => decodeEntities(match[1] ?? ""))
        .join(""),
    )
    .filter((block) => block.length > 0)
    .join("\n");
}

function readParts(
  bytes: Uint8Array,
  wanted: (name: string) => boolean,
  kind: string,
): Map<string, string> {
  try {
    return readOoxmlParts(bytes, wanted);
  } catch (error) {
    if (error instanceof OoxmlArchiveError) {
      throw new OoxmlTextError(error.message);
    }
    throw new OoxmlTextError(`This ${kind} could not be read.`);
  }
}

export function extractDocxText(bytes: Uint8Array): string {
  const parts = readParts(bytes, (name) => name === DOCX_BODY, "Word document");
  const body = parts.get(DOCX_BODY);
  if (body === undefined) {
    throw new OoxmlTextError("This Word document could not be read.");
  }
  assertNoDoctype(body, "Word document");
  return toStorableText(runTextFrom(body, WORD_RUN_TEXT, WORD_BREAK));
}

export function extractPptxText(bytes: Uint8Array): string {
  const parts = readParts(
    bytes,
    (name) => PPTX_SLIDE.test(name),
    "PowerPoint file",
  );
  if (parts.size === 0) {
    throw new OoxmlTextError("This PowerPoint file could not be read.");
  }
  // Archive order is not slide order: slide10 commonly sits before slide2.
  const ordered = [...parts.entries()].sort(([a], [b]) => {
    const left = Number(PPTX_SLIDE.exec(a)?.[1] ?? 0);
    const right = Number(PPTX_SLIDE.exec(b)?.[1] ?? 0);
    return left - right;
  });
  const slides = ordered.map(([name, xml]) => {
    assertNoDoctype(xml, "PowerPoint file");
    return runTextFrom(xml, SLIDE_RUN_TEXT, SLIDE_BREAK);
  });
  return toStorableText(slides.join("\n\n"));
}
