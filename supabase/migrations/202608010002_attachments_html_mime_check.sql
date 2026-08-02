-- Migration 202607260001 added text/html to the discovery-attachments storage
-- bucket (and the app layer already allowed it), but never to the attachments
-- table's mime_type check. So an HTML upload passed schema validation, text
-- extraction, and the Storage API, then failed at createAttachmentIntent's
-- INSERT with "We could not save the attachment". Add text/html to the table
-- check so it matches the bucket, the schema, and the extractor.
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
      'image/gif'
    )
  );
