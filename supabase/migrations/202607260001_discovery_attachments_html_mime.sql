-- The discovery-attachments bucket's allowed_mime_types never gained
-- text/html when the application layer (AttachmentInputSchema,
-- attachment-extractor.ts) added HTML export support. Every HTML upload
-- passed app-level validation and text extraction, then failed at the
-- Storage API itself with 400 invalid_mime_type, silently, since the
-- caller in createRoomFromUploads discards the error into failedFileNames
-- with no log line anywhere.
update storage.buckets
set allowed_mime_types = array[
  'text/plain',
  'text/markdown',
  'text/html',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
]
where id = 'discovery-attachments';
