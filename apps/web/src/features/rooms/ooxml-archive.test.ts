import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readOoxmlParts } from "./ooxml-archive";

// Builds a ZIP by hand so a test can express a hostile archive -- a lying
// size header, a traversal name, a bomb -- which no real .docx would contain.
type Entry = { name: string; data: Uint8Array; declaredUncompressed?: number };

function zip(entries: Entry[], options: { totalEntriesOverride?: number } = {}) {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(Buffer.from(entry.data));
    const uncompressed = entry.declaredUncompressed ?? entry.data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(0, 14); // crc, unchecked
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(uncompressed, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, compressed);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(0, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(uncompressed, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += local.length + name.length + compressed.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  const count = options.totalEntriesOverride ?? entries.length;
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(count, 8);
  eocd.writeUInt16LE(count, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...chunks, cdBuf, eocd]));
}

const text = (s: string) => new TextEncoder().encode(s);
const CONTENT_TYPES = { name: "[Content_Types].xml", data: text("<Types/>") };

describe("readOoxmlParts", () => {
  it("returns only the parts asked for, decoded as text", () => {
    const archive = zip([
      CONTENT_TYPES,
      { name: "word/document.xml", data: text("<w:t>hello</w:t>") },
      { name: "word/settings.xml", data: text("<settings/>") },
    ]);
    const parts = readOoxmlParts(archive, (n) => n === "word/document.xml");
    expect([...parts.keys()]).toEqual(["word/document.xml"]);
    expect(parts.get("word/document.xml")).toContain("hello");
  });

  it("rejects anything that is not a zip", () => {
    expect(() => readOoxmlParts(text("not a zip at all"), () => true)).toThrow(
      /not a valid/i,
    );
  });

  it("rejects an archive with no [Content_Types].xml, which no OOXML file lacks", () => {
    const archive = zip([{ name: "word/document.xml", data: text("<w:t>x</w:t>") }]);
    expect(() => readOoxmlParts(archive, () => true)).toThrow(/not a valid/i);
  });

  it("refuses a decompression bomb by its declared size, before inflating", () => {
    const archive = zip([
      CONTENT_TYPES,
      {
        name: "word/document.xml",
        data: text("a".repeat(1000)),
        declaredUncompressed: 3_000_000_000,
      },
    ]);
    expect(() => readOoxmlParts(archive, () => true)).toThrow(/too large/i);
  });

  it("refuses an archive whose parts add up past the total budget", () => {
    // Each part is under the per-part ceiling, so only the running total
    // catches this -- the many-small-bombs shape a per-part check alone misses.
    const archive = zip([
      CONTENT_TYPES,
      ...Array.from({ length: 3 }, (_, i) => ({
        name: `ppt/slides/slide${i}.xml`,
        data: text("a".repeat(64)),
        declaredUncompressed: 15 * 1024 * 1024,
      })),
    ]);
    expect(() => readOoxmlParts(archive, () => true)).toThrow(/too large/i);
  });

  it("refuses an archive with an implausible number of entries", () => {
    const archive = zip([CONTENT_TYPES], { totalEntriesOverride: 60_000 });
    expect(() => readOoxmlParts(archive, () => true)).toThrow(/too many/i);
  });

  it("ignores entries that try to escape their archive", () => {
    const archive = zip([
      CONTENT_TYPES,
      { name: "../../etc/passwd", data: text("root:x:0:0") },
      { name: "/absolute/path.xml", data: text("nope") },
      { name: "word/document.xml", data: text("<w:t>safe</w:t>") },
    ]);
    const parts = readOoxmlParts(archive, () => true);
    expect([...parts.keys()]).not.toContain("../../etc/passwd");
    expect([...parts.keys()]).not.toContain("/absolute/path.xml");
    expect([...parts.keys()]).toContain("word/document.xml");
  });

  it("never inflates a part the caller did not ask for", () => {
    // A bomb parked in an unrequested part must stay unread rather than be
    // decompressed and then discarded.
    const archive = zip([
      CONTENT_TYPES,
      {
        name: "word/embeddings/bomb.bin",
        data: text("a".repeat(100)),
        declaredUncompressed: 3_000_000_000,
      },
      { name: "word/document.xml", data: text("<w:t>fine</w:t>") },
    ]);
    const parts = readOoxmlParts(archive, (n) => n === "word/document.xml");
    expect(parts.get("word/document.xml")).toContain("fine");
  });
});
