const ACTIVE_DOCUMENT_MIME_TYPES = new Set([
  "application/xml",
  "image/svg+xml",
  "text/html",
  "text/xml",
]);

export function requiresAttachmentDownload(mimeType: string): boolean {
  return ACTIVE_DOCUMENT_MIME_TYPES.has(mimeType);
}
