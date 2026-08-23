-- Word and PowerPoint are the documents people actually bring to a room, and
-- the bucket refused both. Adding only the OOXML (XML-based, 2007+) types:
-- the macro-enabled containers (.docm/.pptm) and the legacy binary formats
-- (.doc/.ppt, which are OLE compound files) stay out. Nothing in Meld executes
-- an attachment, but a container whose reason to exist is carrying VBA has no
-- reason to be accepted, and the legacy binaries have no extractor here.
--
-- The bucket's MIME list is the last line rather than the first: the extractor
-- verifies the ZIP signature and the OOXML structure before this is reached,
-- so a renamed file is refused on its bytes, not on its label.
update storage.buckets
set allowed_mime_types = allowed_mime_types || array[
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]
where id = 'discovery-attachments'
  and not (
    allowed_mime_types @>
    array['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  );
