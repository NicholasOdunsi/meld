-- DesignSystemBanner's file picker advertises text/html/.html/.htm alongside
-- text/plain, text/markdown, and application/pdf (see
-- apps/web/src/features/design/components/design-system-banner.tsx), but the
-- design-system bucket's allowed_mime_types (202608130005_design_profiles.sql)
-- never gained text/html. An HTML upload passed client-side validation and
-- text extraction, then failed opaquely at the Storage API itself with 400
-- invalid_mime_type -- the same class of bug
-- 202607260001_discovery_attachments_html_mime.sql fixed for the
-- discovery-attachments bucket.
update storage.buckets
set allowed_mime_types = array[
  'text/plain',
  'text/markdown',
  'text/html',
  'application/pdf'
]
where id = 'design-system';
