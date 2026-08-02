// Browsers frequently send an empty or generic MIME type for text-family files
// (.md, .csv, .yaml, ...). Extraction and validation both key off MIME, so we
// recover the type from the extension when the browser is unhelpful.
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

// One source of truth for every file picker's `accept` attribute.
export const ACCEPTED_ATTACHMENT_FILE_TYPES = [
  ".txt",
  ".md",
  ".html",
  ".htm",
  ".pdf",
  ".csv",
  ".json",
  ".xml",
  ".yaml",
  ".yml",
  ".tsv",
  ...IMAGE_MIME_TYPES,
].join(",");
