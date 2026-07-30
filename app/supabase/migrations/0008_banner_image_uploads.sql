-- AfetHUB — migration 0008
-- Uploaded banner images.
--
-- Slide images may now come from a coordinator upload as well as from the files that
-- ship with the app. Two forms are allowed in `banner_slides.image`:
--
--   '/banners/<file>'   a file committed to app/public/banners/
--   'upload:<object>'   an object in the `banner-images` Storage bucket
--
-- Note what is still NOT allowed: an arbitrary https URL. The database stores no host,
-- so the application decides where slide images are fetched from and an admin cannot
-- point the home page at a third-party server that would see every visitor's IP
-- (rules/03 §File Uploads). Uploads are re-encoded to WebP in the browser before they
-- reach the bucket (src/imageUpload.ts), which also strips camera EXIF/GPS.
--
-- Additive and idempotent.
-- =============================================================================

alter table banner_slides drop constraint if exists banner_slides_image_check;

do $$ begin
  alter table banner_slides
    add constraint banner_slides_image_check
    check (
      image = ''
      or image ~ '^/banners/[A-Za-z0-9._-]+\.(webp|png|svg|jpg)$'
      or image ~ '^upload:[A-Za-z0-9._/-]+\.webp$'
    );
exception when duplicate_object then null; end $$;

-- ---------- Storage bucket ---------------------------------------------------
-- Public read: these images are painted on the public home page, so there is nothing
-- to protect by making the objects private — and a signed URL per slide would break
-- caching for exactly the weak-network users the product targets.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('banner-images', 'banner-images', true, 8388608, array['image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 8388608,
      allowed_mime_types = array['image/webp'];

-- Only WebP is accepted at the bucket level too, so a client that skips the browser
-- conversion still cannot store a 4 MB JPEG.

drop policy if exists banner_images_public_read on storage.objects;
create policy banner_images_public_read on storage.objects
  for select using (bucket_id = 'banner-images');

-- Writes are coordinator-only. This is the actual authorisation; the panel hiding the
-- upload button is not one (rules/03 §Server-Side Authorization).
drop policy if exists banner_images_coord_insert on storage.objects;
create policy banner_images_coord_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'banner-images' and is_coordinator());

drop policy if exists banner_images_coord_update on storage.objects;
create policy banner_images_coord_update on storage.objects
  for update to authenticated
  using (bucket_id = 'banner-images' and is_coordinator())
  with check (bucket_id = 'banner-images' and is_coordinator());

drop policy if exists banner_images_coord_delete on storage.objects;
create policy banner_images_coord_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'banner-images' and is_coordinator());

-- ---------- Avatars ----------------------------------------------------------
-- The avatars bucket already existed and accepted whatever the browser sent. Pin it to
-- WebP as well: profile photos were being stored as unoptimised JPEGs straight from the
-- camera roll, EXIF and all.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/webp'];

-- Existing avatar objects are left alone; they keep working. New uploads are WebP.
-- Re-encoding the stored history is a separate, optional cleanup and is NOT done here.
