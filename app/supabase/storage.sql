-- AfetHUB · Storage + media columns (already applied to the live project).
-- Run once on a fresh project AFTER schema.sql. Documents delivery photos + avatars.

-- ---- Columns ----------------------------------------------------------------
alter table submissions add column if not exists photo_url  text;
alter table profiles    add column if not exists avatar_url text;

-- ---- Bucket: delivery photos (public, images, max 8MB) ----------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-photos', 'delivery-photos', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists delivery_photos_read on storage.objects;
create policy delivery_photos_read on storage.objects for select using (bucket_id = 'delivery-photos');
-- Anyone may upload a delivery photo (no account needed — matches public reporting).
drop policy if exists delivery_photos_insert on storage.objects;
create policy delivery_photos_insert on storage.objects for insert with check (bucket_id = 'delivery-photos');

-- ---- Bucket: avatars (public, images, max 2MB; each user owns <uid>/ folder) -
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
