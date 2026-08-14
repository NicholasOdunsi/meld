insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'design-reference-thumbnails', 'design-reference-thumbnails', false,
  5 * 1024 * 1024,
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do nothing;

-- Participant-scoped, keyed on the room id encoded as the first path segment,
-- exactly like discovery-attachments. storage_room_id(name) already exists.
create policy "Participants read design reference thumbnails"
on storage.objects for select to authenticated
using (
  bucket_id = 'design-reference-thumbnails'
  and public.is_room_participant(public.storage_room_id(name))
);

create policy "Editors write design reference thumbnails"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'design-reference-thumbnails'
  and public.can_edit_room(public.storage_room_id(name))
);

create policy "Editors update design reference thumbnails"
on storage.objects for update to authenticated
using (
  bucket_id = 'design-reference-thumbnails'
  and public.can_edit_room(public.storage_room_id(name))
);

create policy "Editors delete design reference thumbnails"
on storage.objects for delete to authenticated
using (
  bucket_id = 'design-reference-thumbnails'
  and public.can_edit_room(public.storage_room_id(name))
);
