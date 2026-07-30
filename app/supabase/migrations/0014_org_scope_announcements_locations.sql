-- AfetHUB — migration 0014
-- Three things:
--   1) a coordinator may only edit THEIR OWN organization (admins keep full access)
--   2) announcements get an image, and a bucket to put it in
--   3) delivery points and announcements become manageable from the panel, with audit
--
-- Additive and idempotent, but note (1) is a RESTRICTION: `organizations_coord_write`
-- previously let any coordinator write any organization record.
-- =============================================================================

-- =============================================================================
-- 1) Organization write scope
-- =============================================================================
-- Which organization the caller may write. NULL when they may write none.
-- The column is `organization_id` (see migration 0006), not `org_id` — the client type
-- calls it `orgId`, which is where the temptation to guess comes from.
--
-- The membership must be VERIFIED. `profiles.organization_id` is self-declared — anyone can
-- claim to belong to AFAD from the account page — so an unverified membership granting
-- write access to that institution's public record would be an authorization hole, not
-- a convenience (rules/03 §Server-Side Authorization; migration 0006 already pins
-- `org_verified` so a user cannot set it themselves).
create or replace function my_writable_org()
returns uuid language sql stable security definer set search_path = public as $$
  select p.organization_id
  from profiles p
  where p.id = auth.uid()
    and p.role in ('coordinator','admin')
    and p.org_verified = true
    and p.organization_id is not null;
$$;
revoke all on function my_writable_org() from public, anon;
grant execute on function my_writable_org() to authenticated;

-- Replace the blanket coordinator policy with three narrower ones.
drop policy if exists organizations_coord_write on organizations;

-- An admin keeps full access: someone has to be able to fix a record whose own
-- institution is not around to fix it.
drop policy if exists organizations_admin_write on organizations;
create policy organizations_admin_write on organizations
  for all using (is_admin()) with check (is_admin());

-- A coordinator may update exactly one row: their own verified organization. And they
-- may not touch the fields that decide trust — status, is_official, the verification
-- columns and the logo stay where they were, otherwise "edit your own record" would be
-- a path to self-verification.
drop policy if exists organizations_own_org_update on organizations;
create policy organizations_own_org_update on organizations
  for update
  using (is_coordinator() and id = my_writable_org())
  with check (
    is_coordinator() and id = my_writable_org()
    and status      = (select o.status      from organizations o where o.id = organizations.id)
    and is_official = (select o.is_official from organizations o where o.id = organizations.id)
    and verified_at is not distinct from (select o.verified_at from organizations o where o.id = organizations.id)
    and logo        = (select o.logo        from organizations o where o.id = organizations.id)
  );

-- A coordinator may still SELECT the base table (the review queue and the panel need
-- it); that policy is unchanged from 0002.

-- Verification: still a coordinator action, but never on your own record. Reviewing the
-- institution you belong to is the definition of self-verification.
create or replace function verify_organization(
  p_org    uuid,
  p_status org_status,
  p_reason text default ''
) returns organizations
language plpgsql security definer set search_path = public as $$
declare
  v_before org_status;
  v_row    organizations;
begin
  if not is_coordinator() then
    raise exception 'not authorized';
  end if;
  -- An admin is allowed through: they are not acting for the institution, and blocking
  -- them could leave a record permanently unverifiable in a one-admin deployment.
  if not is_admin() and p_org = my_writable_org() then
    raise exception 'cannot verify your own organization';
  end if;
  if p_status = 'Rejected' and length(btrim(p_reason)) = 0 then
    raise exception 'reject reason required';
  end if;

  select status into v_before from organizations where id = p_org for update;
  if v_before is null then
    raise exception 'organization not found';
  end if;

  update organizations set
    status        = p_status,
    is_official   = case when p_status = 'Verified' and kind in ('Kamu kurumu','Belediye')
                         then true else is_official end,
    verified_by   = auth.uid(),
    verified_at   = now(),
    reject_reason = case when p_status = 'Rejected' then p_reason else '' end,
    updated_at    = now()
  where id = p_org
  returning * into v_row;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (
    null,
    coalesce((select full_name from profiles where id = auth.uid()), 'Koordinatör'),
    case p_status
      when 'Verified' then 'Kurum doğrulandı'
      when 'Rejected' then 'Kurum reddedildi'
      else 'Kurum durumu güncellendi'
    end,
    v_row.name || coalesce(' · ' || nullif(v_row.province, ''), ''),
    v_before::text,
    p_status::text,
    case p_status when 'Verified' then '#159947' when 'Rejected' then '#D9363E' else '#E6A700' end
  );

  return v_row;
end $$;
revoke all on function verify_organization(uuid, org_status, text) from public, anon;
grant execute on function verify_organization(uuid, org_status, text) to authenticated;

-- Creating a record straight into "Verified" is an admin power. A coordinator could
-- otherwise create a verified "AFAD" out of nothing, which is exactly the affiliation
-- claim the directory exists to prevent (rules/03 §Legal and Safety Disclaimer). A
-- coordinator can still add one — it lands as "Doğrulama bekliyor", like a visitor's.
drop policy if exists organizations_public_insert on organizations;
create policy organizations_public_insert on organizations
  for insert with check (
    is_admin()
    or (
      status = 'Pending verification'
      and is_official = false
      and verified_by is null
      and verified_at is null
      and reject_reason = ''
    )
  );

-- =============================================================================
-- 2) Announcements: image + panel management
-- =============================================================================
-- Same rule as slides and logos: the value is either a path we ship or an object in our
-- own bucket ('upload:<name>.webp'). Never an arbitrary URL — an admin-supplied remote
-- image would render a third-party asset to every visitor and can track them
-- (rules/03 §File Uploads).
alter table announcements
  add column if not exists image text not null default '';

do $$ begin
  alter table announcements
    add constraint announcements_image_local check (
      image = ''
      or image ~ '^/banners/[A-Za-z0-9._-]+\.(webp|png|svg|jpg)$'
      or image ~ '^upload:[A-Za-z0-9._/-]+\.webp$'
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table announcements
    add constraint announcements_title_not_blank check (btrim(title) <> '');
exception when duplicate_object then null; end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('announcement-images', 'announcement-images', true, 8388608, array['image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 8388608, allowed_mime_types = array['image/webp'];

-- WebP only at the bucket level too, so a client that skips the browser conversion
-- still cannot store a 4 MB JPEG.
drop policy if exists announcement_images_public_read on storage.objects;
create policy announcement_images_public_read on storage.objects
  for select using (bucket_id = 'announcement-images');

drop policy if exists announcement_images_coord_insert on storage.objects;
create policy announcement_images_coord_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'announcement-images' and is_coordinator());

drop policy if exists announcement_images_coord_update on storage.objects;
create policy announcement_images_coord_update on storage.objects
  for update to authenticated
  using (bucket_id = 'announcement-images' and is_coordinator())
  with check (bucket_id = 'announcement-images' and is_coordinator());

drop policy if exists announcement_images_coord_delete on storage.objects;
create policy announcement_images_coord_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'announcement-images' and is_coordinator());

-- Announcements and locations are per-operation operational content, not institution
-- identity, so they stay open to any coordinator — the scoping above is about who a
-- record *claims to be*, which is a different question.
-- The write policies from schema.sql already say is_coordinator(); they are restated
-- here so this file is a complete description of the surface it touches.
drop policy if exists announcements_coord_write on announcements;
create policy announcements_coord_write on announcements
  for all using (is_coordinator()) with check (is_coordinator());

drop policy if exists locations_coord_write on locations;
create policy locations_coord_write on locations
  for all using (is_coordinator()) with check (is_coordinator());

-- =============================================================================
-- 3) Audit for announcement / location changes
-- =============================================================================
-- These change what the public page tells people to do — where to take aid, what is
-- happening — so they belong in the audit log like every other coordinator action
-- (rules/03 §Audit Log). Triggers rather than client-side inserts: a client that
-- forgets the second call would leave an unexplained change.
create or replace function audit_announcement_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text := coalesce((select full_name from profiles where id = auth.uid()), 'Koordinatör');
begin
  if tg_op = 'INSERT' then
    insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
    values (new.disaster_id, v_actor, 'Duyuru yayınlandı', new.title, '—',
            case when new.image <> '' then 'Görselli duyuru' else 'Duyuru' end, '#2A6FB0');
    return new;
  elsif tg_op = 'UPDATE' then
    insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
    values (new.disaster_id, v_actor, 'Duyuru güncellendi', new.title, old.title, new.title, '#2A6FB0');
    return new;
  else
    insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
    values (old.disaster_id, v_actor, 'Duyuru kaldırıldı', old.title, old.title, '—', '#D9363E');
    return old;
  end if;
end $$;

drop trigger if exists announcements_audit on announcements;
create trigger announcements_audit after insert or update or delete on announcements
  for each row execute function audit_announcement_change();

create or replace function audit_location_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text := coalesce((select full_name from profiles where id = auth.uid()), 'Koordinatör');
begin
  if tg_op = 'INSERT' then
    insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
    values (new.disaster_id, v_actor, 'Teslim noktası eklendi', new.name, '—',
            coalesce(nullif(new.address, ''), new.name), '#159947');
    return new;
  elsif tg_op = 'UPDATE' then
    insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
    values (new.disaster_id, v_actor, 'Teslim noktası güncellendi', new.name,
            coalesce(nullif(old.status, ''), '—'), coalesce(nullif(new.status, ''), '—'), '#E6A700');
    return new;
  else
    insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
    values (old.disaster_id, v_actor, 'Teslim noktası kaldırıldı', old.name, old.name, '—', '#D9363E');
    return old;
  end if;
end $$;

drop trigger if exists locations_audit on locations;
create trigger locations_audit after insert or update or delete on locations
  for each row execute function audit_location_change();

-- Note on deletion: a delivery point IS hard-deletable here, unlike an operation. It
-- carries no quantities and no submissions of its own — needs reference it by display
-- name, not by id — so removing one loses nothing auditable, and the trigger above
-- records that it happened. If locations ever become a foreign key target, this must
-- become an archive flag instead (rules/05 §Soft Deletion).
