// Browsers frequently send an empty or generic MIME type for text-family files
// (.md, .csv, .yaml, ...). Extraction and validation both key off MIME, so we
// recover the type from the extension when the browser is unhelpful.
// The OOXML types, named because they are long enough to typo silently and are
// referenced by the extractor, the accept list and the storage bucket alike.
export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const PPTX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

// Note the macro-enabled variants (.docm/.pptm) are deliberately absent: those
// containers exist to carry VBA, and nothing here needs to accept one.
const EXTENSION_MIME_TYPES: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
  htm: "text/html",
  pdf: "application/pdf",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  yaml: "text/yaml",
  yml: "text/yaml",
  tsv: "text/tab-separated-values",
  svg: "image/svg+xml",
  docx: DOCX_MIME_TYPE,
  pptx: PPTX_MIME_TYPE,
};

const GENERIC_MIME_TYPES = new Set(["", "application/octet-stream"]);

export function resolveMimeType(
  fileName: string,
  declaredType: string,
): string {
  if (!GENERIC_MIME_TYPES.has(declaredType)) {
    return declaredType;
  }
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MIME_TYPES[extension] ?? declaredType;
}

const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];

// The one list of what Meld accepts as an attachment. The composer's client
// gate, the server's AttachmentInputSchema and the extractor all read it, so a
// format cannot be half-added -- offered by the picker but refused by a
// validator, which is exactly how .docx and .pptx first landed.
export const ALLOWED_ATTACHMENT_MIME_TYPES: ReadonlySet<string> = new Set([
  "text/plain",
  "text/markdown",
  "text/html",
  "text/csv",
  "text/tab-separated-values",
  "text/yaml",
  "application/yaml",
  "application/json",
  "application/xml",
  "text/xml",
  "application/pdf",
  DOCX_MIME_TYPE,
  PPTX_MIME_TYPE,
  ...IMAGE_MIME_TYPES,
]);

// One source of truth for every file picker's `accept` attribute.
export const ACCEPTED_ATTACHMENT_FILE_TYPES = [
  ".txt",
  ".md",
  ".html",
  ".htm",
  ".pdf",
  ".docx",
  ".pptx",
  ".csv",
  ".json",
  ".xml",
  ".yaml",
  ".yml",
  ".tsv",
  ...IMAGE_MIME_TYPES,
].join(",");
