-- The attachments table restates the accepted MIME list as a CHECK constraint,
-- which is the fifth place that list lives (picker, client gate, server schema,
-- storage bucket, here). Adding .docx/.pptx everywhere else still left the
-- insert rejected by Postgres, surfacing as "We could not save the attachment"
-- with nothing to say the type was the problem.
--
-- Only the OOXML types are added. The macro-enabled containers (.docm/.pptm)
-- and the legacy binary formats (.doc/.ppt) stay out: nothing here executes an
-- attachment, but a container whose purpose is carrying VBA has no reason to be
-- storable, and the legacy binaries have no extractor.
alter table public.attachments
  drop constraint if exists attachments_mime_type_check;

alter table public.attachments
  add constraint attachments_mime_type_check check (
    mime_type = any (array[
      'text/plain',
      'text/markdown',
      'text/html',
      'text/csv',
      'text/tab-separated-values',
      'text/yaml',
      'application/yaml',
      'application/json',
      'application/xml',
      'text/xml',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/svg+xml'
    ])
  );
