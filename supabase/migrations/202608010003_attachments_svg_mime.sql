-- Allow SVG uploads in the discovery composer. Like every other accepted type,
-- image/svg+xml must be permitted at BOTH the storage bucket (or the Storage
-- API rejects the upload with 400 invalid_mime_type) and the attachments table
-- check (or createAttachmentIntent's INSERT fails). The application layer
-- (AttachmentInputSchema, the MIME resolver, the extractor, the file picker's
-- accept list) already accepts it.

update storage.buckets
set allowed_mime_types = array[
  'text/plain',
  'text/markdown',
  'text/html',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml'
]
where id = 'discovery-attachments';

alter table public.attachments
  drop constraint attachments_mime_type_check,
  add constraint attachments_mime_type_check check (
    mime_type in (
      'text/plain',
      'text/markdown',
      'text/html',
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/svg+xml'
    )
  );
