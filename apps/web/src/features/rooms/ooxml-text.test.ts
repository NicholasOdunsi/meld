import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractDocxText, extractPptxText } from "./ooxml-text";

type Entry = { name: string; data: Uint8Array };

function zip(entries: Entry[]) {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(Buffer.from(entry.data));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, compressed);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(entry.data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += local.length + name.length + compressed.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...chunks, cdBuf, eocd]));
}

const text = (s: string) => new TextEncoder().encode(s);
const CT = { name: "[Content_Types].xml", data: text("<Types/>") };
const NUL = String.fromCharCode(0);

function docx(documentXml: string) {
  return zip([CT, { name: "word/document.xml", data: text(documentXml) }]);
}

describe("extractDocxText", () => {
  it("reads the run text in document order", () => {
    const out = extractDocxText(
      docx(
        "<w:p><w:r><w:t>Property</w:t></w:r><w:r><w:t xml:space='preserve'> Plan</w:t></w:r></w:p>",
      ),
    );
    expect(out).toBe("Property Plan");
  });

  it("keeps paragraphs apart instead of running them together", () => {
    const out = extractDocxText(
      docx("<w:p><w:r><w:t>One</w:t></w:r></w:p><w:p><w:r><w:t>Two</w:t></w:r></w:p>"),
    );
    expect(out).toMatch(/One\s+Two/);
  });

  it("decodes XML entities rather than leaking markup", () => {
    const out = extractDocxText(
      docx("<w:p><w:r><w:t>R&amp;D &lt;draft&gt;</w:t></w:r></w:p>"),
    );
    expect(out).toBe("R&D <draft>");
  });

  it("refuses a document that declares external entities", () => {
    // The classic XXE shape. We never hand this to an XML parser, so it cannot
    // resolve -- but a file carrying it is hostile by construction, and saying
    // so is better than silently returning the text around it.
    const evil =
      "<!DOCTYPE foo [<!ENTITY xxe SYSTEM 'file:///etc/passwd'>]>" +
      "<w:p><w:r><w:t>hello</w:t></w:r></w:p>";
    expect(() => extractDocxText(docx(evil))).toThrow(/not supported/i);
  });

  it("strips NUL, which Postgres rejects outright in a text column", () => {
    // Extracted text is written to attachments.extracted_text. A NUL anywhere
    // in it makes the insert fail, so a document containing one would break the
    // upload rather than the file.
    const out = extractDocxText(
      docx("<w:p><w:r><w:t>safe" + NUL + "text</w:t></w:r></w:p>"),
    );
    expect(out).not.toContain(NUL);
    expect(out).toContain("safe");
  });

  it("rejects a .docx with no word/document.xml", () => {
    expect(() => extractDocxText(zip([CT]))).toThrow(/could not be read/i);
  });
});

describe("extractPptxText", () => {
  it("reads every slide, in slide order rather than archive order", () => {
    const slide = (t: string) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`;
    const archive = zip([
      CT,
      { name: "ppt/slides/slide10.xml", data: text(slide("Ten")) },
      { name: "ppt/slides/slide2.xml", data: text(slide("Two")) },
      { name: "ppt/slides/slide1.xml", data: text(slide("One")) },
    ]);
    const out = extractPptxText(archive);
    expect(out.indexOf("One")).toBeLessThan(out.indexOf("Two"));
    expect(out.indexOf("Two")).toBeLessThan(out.indexOf("Ten"));
  });

  it("rejects a .pptx with no slides", () => {
    expect(() => extractPptxText(zip([CT]))).toThrow(/could not be read/i);
  });
});
