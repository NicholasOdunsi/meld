-- Keep Storage, the attachments table, and AttachmentInputSchema in parity.
-- Structured-text formats were accepted and extracted by the application but
-- still rejected by one or both persistence layers.
update storage.buckets
set allowed_mime_types = array[
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
      'text/csv',
      'text/tab-separated-values',
      'text/yaml',
      'application/yaml',
      'application/json',
      'application/xml',
      'text/xml',
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/svg+xml'
    )
  );
