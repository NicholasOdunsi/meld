import { inflateRawSync } from "node:zlib";

// .docx and .pptx are ZIP archives, which means an attachment is an archive an
// untrusted person chose the contents of. A general-purpose unzip library will
// happily expand whatever it is handed; this reader will not. It reads the
// central directory, decompresses only the parts the caller names, and refuses
// anything whose declared or actual size is implausible for a document.
//
// It also never touches the filesystem -- parts are decoded in memory and
// returned as strings -- so there is nothing for a traversal name to overwrite.
// Entry names are still validated, because a name that tries to escape says
// something about the archive worth refusing on.

const ZIP_LOCAL_HEADER = 0x04034b50;
const ZIP_CENTRAL_HEADER = 0x02014b50;
const ZIP_EOCD = 0x06054b50;
const EOCD_MIN_SIZE = 22;
// The comment is the only variable-length tail, and it is capped at 64 KiB by
// the format, so the record cannot start earlier than this from the end.
const EOCD_MAX_SEARCH = 0xffff + EOCD_MIN_SIZE;

/** Real documents are tens to low hundreds of parts; 4096 is far past normal. */
const MAX_ENTRIES = 4096;
/** Any single part larger than this is not document text. */
const MAX_PART_BYTES = 16 * 1024 * 1024;
/** Everything the caller asked for, summed. Bounds a many-small-bombs archive. */
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

export class OoxmlArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OoxmlArchiveError";
  }
}

// Escapes its own archive, is absolute, or is a Windows drive/UNC path. None of
// these can hurt an in-memory read, but none belong in a document either.
function isUnsafeEntryName(name: string): boolean {
  if (name.length === 0 || name.length > 512) return true;
  if (name.startsWith("/") || name.startsWith("\\")) return true;
  if (/^[a-zA-Z]:/.test(name)) return true;
  if (name.split(/[\\/]/).some((segment) => segment === "..")) return true;
  // A NUL in a name is a truncation trick, never a real part.
  return name.includes("\0");
}

type CentralEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

function findEndOfCentralDirectory(view: DataView, bytes: Uint8Array): number {
  const earliest = Math.max(0, bytes.length - EOCD_MAX_SEARCH);
  for (let offset = bytes.length - EOCD_MIN_SIZE; offset >= earliest; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_EOCD) return offset;
  }
  throw new OoxmlArchiveError("This file is not a valid Word or PowerPoint document.");
}

function readCentralDirectory(view: DataView, bytes: Uint8Array): CentralEntry[] {
  const eocd = findEndOfCentralDirectory(view, bytes);
  const totalEntries = view.getUint16(eocd + 10, true);
  if (totalEntries > MAX_ENTRIES) {
    throw new OoxmlArchiveError("This document has too many parts to read safely.");
  }
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (directoryOffset + directorySize > bytes.length) {
    throw new OoxmlArchiveError("This file is not a valid Word or PowerPoint document.");
  }

  const entries: CentralEntry[] = [];
  let cursor = directoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > bytes.length) break;
    if (view.getUint32(cursor, true) !== ZIP_CENTRAL_HEADER) break;
    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const nameStart = cursor + 46;
    if (nameStart + nameLength > bytes.length) break;
    const name = new TextDecoder("utf-8", { fatal: false }).decode(
      bytes.subarray(nameStart, nameStart + nameLength),
    );
    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    cursor = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
}

function inflateEntry(
  bytes: Uint8Array,
  view: DataView,
  entry: CentralEntry,
): Uint8Array {
  const header = entry.localHeaderOffset;
  if (header + 30 > bytes.length) {
    throw new OoxmlArchiveError("This file is not a valid Word or PowerPoint document.");
  }
  if (view.getUint32(header, true) !== ZIP_LOCAL_HEADER) {
    throw new OoxmlArchiveError("This file is not a valid Word or PowerPoint document.");
  }
  const nameLength = view.getUint16(header + 26, true);
  const extraLength = view.getUint16(header + 28, true);
  const dataStart = header + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > bytes.length) {
    throw new OoxmlArchiveError("This file is not a valid Word or PowerPoint document.");
  }
  const data = bytes.subarray(dataStart, dataEnd);

  if (entry.compressionMethod === 0) return data;
  if (entry.compressionMethod !== 8) {
    throw new OoxmlArchiveError("This document uses an unsupported compression method.");
  }
  // maxOutputLength is the real bomb guard: zlib stops and throws mid-stream
  // rather than allocating past the cap, so a lying size header cannot be used
  // to get a gigabyte allocated before anyone checks.
  try {
    return new Uint8Array(
      inflateRawSync(data, { maxOutputLength: MAX_PART_BYTES }),
    );
  } catch {
    throw new OoxmlArchiveError("A part of this document is too large to read safely.");
  }
}

/**
 * Decodes the named parts of an OOXML archive to text.
 *
 * `wanted` is consulted before anything is decompressed, so a bomb parked in a
 * part nobody asked for is never inflated at all.
 */
export function readOoxmlParts(
  bytes: Uint8Array,
  wanted: (name: string) => boolean,
): Map<string, string> {
  if (bytes.length < EOCD_MIN_SIZE) {
    throw new OoxmlArchiveError("This file is not a valid Word or PowerPoint document.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = readCentralDirectory(view, bytes);

  // Every OOXML package has this at its root. Requiring it rejects a plain ZIP
  // renamed to .docx before any of its contents are touched.
  if (!entries.some((entry) => entry.name === "[Content_Types].xml")) {
    throw new OoxmlArchiveError("This file is not a valid Word or PowerPoint document.");
  }

  const parts = new Map<string, string>();
  let totalBytes = 0;
  const decoder = new TextDecoder("utf-8", { fatal: false });
  for (const entry of entries) {
    if (isUnsafeEntryName(entry.name)) continue;
    if (!wanted(entry.name)) continue;
    if (entry.uncompressedSize > MAX_PART_BYTES) {
      throw new OoxmlArchiveError("A part of this document is too large to read safely.");
    }
    totalBytes += entry.uncompressedSize;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new OoxmlArchiveError("This document is too large to read safely.");
    }
    parts.set(entry.name, decoder.decode(inflateEntry(bytes, view, entry)));
  }
  return parts;
}
