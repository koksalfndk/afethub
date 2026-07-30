-- AfetHUB — migration 0021
-- Two changes to what a volunteer and a coordinator may do.
--
-- 1) "Aktif gönüllü" — standing permission to be contacted.
--    Normally a coordinator reaches a volunteer about the operation they applied for.
--    This flag says: if a disaster happens near me, call me without asking first. It is
--    a permission the person gives, so it is stored per application, it is off by
--    default, and it can be taken back at ANY time — including on an approved
--    application. A consent you cannot revoke is not a consent (rules/03 §Data
--    Minimization, §Contact Information).
--
-- 2) An approved application can no longer be withdrawn by the volunteer either.
--    0019 already blocked editing; withdrawal now follows. Once a coordinator has
--    accepted someone into the roster, the roster stops changing under them without
--    their knowledge.
--
--    What this deliberately does NOT do: trap anyone. The standing-consent switch above
--    stays available whatever the status is, so a person can always stop being called
--    out of the blue. Coming off the roster entirely is now a conversation with a
--    coordinator, who can set the status from the panel — which is also the only way the
--    other side finds out.
--
-- Additive and idempotent.
-- =============================================================================

alter table volunteer_applications
  add column if not exists standing_contact_consent boolean not null default false;
alter table volunteer_applications
  add column if not exists standing_consent_at timestamptz;

comment on column volunteer_applications.standing_contact_consent is
  'Volunteer allows coordinators to contact them about nearby disasters without asking first. Revocable at any time.';

-- ---------- 1) Turning the standing permission on and off ---------------------
-- Own row only, matched on the account e-mail like every other self-service call. Works
-- in any status on purpose: this is the one control an approved volunteer keeps.
create or replace function set_my_volunteer_consent(p_app uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_mine boolean; v_name text; v_did uuid; v_before boolean;
begin
  select true, v.full_name, v.disaster_id, v.standing_contact_consent
    into v_mine, v_name, v_did, v_before
  from volunteer_applications v
  where v.id = p_app
    and auth.uid() is not null
    and lower(btrim(v.email)) = (select lower(btrim(u.email)) from auth.users u where u.id = auth.uid())
  for update;
  if v_mine is not true then
    raise exception 'not authorized';
  end if;
  if v_before = p_on then
    return;
  end if;

  update volunteer_applications
     set standing_contact_consent = p_on,
         standing_consent_at = case when p_on then now() else null end
   where id = p_app;

  -- Not on the public allow-list: this names a person and records a permission.
  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (v_did, coalesce(nullif(v_name, ''), 'Gönüllü'),
          case when p_on then 'Aktif gönüllü izni verildi' else 'Aktif gönüllü izni geri alındı' end,
          v_name, case when p_on then 'İzin yok' else 'İzinli' end,
          case when p_on then 'İzinli' else 'İzin yok' end, '#2A6FB0');
end $$;
revoke all on function set_my_volunteer_consent(uuid, boolean) from public, anon;
grant execute on function set_my_volunteer_consent(uuid, boolean) to authenticated;

-- ---------- 2) Withdrawal stops at Approved -----------------------------------
create or replace function withdraw_my_volunteer_application(p_app uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_mine boolean; v_before volunteer_status; v_name text; v_did uuid;
begin
  select true, v.status, v.full_name, v.disaster_id into v_mine, v_before, v_name, v_did
  from volunteer_applications v
  where v.id = p_app
    and auth.uid() is not null
    and lower(btrim(v.email)) = (select lower(btrim(u.email)) from auth.users u where u.id = auth.uid())
  for update;
  if v_mine is not true then
    raise exception 'not authorized';
  end if;
  if v_before = 'Approved' then
    raise exception 'an approved application cannot be withdrawn';
  end if;
  if v_before = 'Withdrawn' then
    return;
  end if;

  update volunteer_applications
     set status = 'Withdrawn', on_shift = false, shift_since = null
   where id = p_app;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (v_did, coalesce(nullif(v_name, ''), 'Gönüllü'), 'Gönüllü başvurusu geri çekildi',
          v_name, v_before::text, 'Withdrawn', '#8095A8');
end $$;
revoke all on function withdraw_my_volunteer_application(uuid) from public, anon;
grant execute on function withdraw_my_volunteer_application(uuid) to authenticated;

-- ---------- 3) The flag travels with the row ----------------------------------
-- Editing keeps setting it too, so the form and the switch cannot disagree. Dropped
-- first: Postgres will not widen an existing argument or OUT list in place.
drop function if exists update_my_volunteer_application(uuid, uuid, text, text, text, text, text[], text, text);
create function update_my_volunteer_application(
  p_app          uuid,
  p_disaster     uuid,
  p_full_name    text,
  p_phone        text,
  p_province     text,
  p_district     text,
  p_skills       text[],
  p_availability text,
  p_note         text,
  p_standing     boolean default false
) returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_mine   boolean;
  v_before volunteer_status;
  v_name   text;
  v_did    uuid;
begin
  select true, v.status, v.full_name, v.disaster_id into v_mine, v_before, v_name, v_did
  from volunteer_applications v
  where v.id = p_app
    and auth.uid() is not null
    and lower(btrim(v.email)) = (select lower(btrim(u.email)) from auth.users u where u.id = auth.uid())
  for update;
  if v_mine is not true then
    raise exception 'not authorized';
  end if;
  if v_before = 'Approved' then
    raise exception 'an approved application cannot be edited';
  end if;
  if v_before in ('Rejected','Withdrawn') then
    raise exception 'application closed';
  end if;
  if length(btrim(p_full_name)) < 2 then
    raise exception 'name required';
  end if;
  if coalesce(array_length(p_skills, 1), 0) = 0 then
    raise exception 'at least one skill required';
  end if;

  update volunteer_applications set
    disaster_id  = p_disaster,
    full_name    = btrim(p_full_name),
    phone        = btrim(coalesce(p_phone, '')),
    province     = btrim(coalesce(p_province, '')),
    district     = btrim(coalesce(p_district, '')),
    skills       = p_skills,
    availability = coalesce(p_availability, ''),
    note         = btrim(coalesce(p_note, '')),
    standing_contact_consent = coalesce(p_standing, false),
    standing_consent_at = case
      when coalesce(p_standing, false) and standing_consent_at is null then now()
      when not coalesce(p_standing, false) then null
      else standing_consent_at end
  where id = p_app;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (v_did, coalesce(nullif(btrim(p_full_name), ''), 'Gönüllü'),
          'Gönüllü başvurusu güncellendi', v_name, v_before::text, v_before::text, '#2A6FB0');
end $$;
revoke all on function update_my_volunteer_application(uuid, uuid, text, text, text, text, text[], text, text, boolean)
  from public, anon;
grant execute on function update_my_volunteer_application(uuid, uuid, text, text, text, text, text[], text, text, boolean)
  to authenticated;

drop function if exists my_volunteer_applications();
create function my_volunteer_applications()
returns table (
  id uuid, code text, disaster_id uuid, disaster_name text,
  full_name text, phone text, email text, province text, district text,
  skills text[], availability text, note text,
  status volunteer_status, review_note text,
  on_shift boolean, shift_since timestamptz,
  standing_contact_consent boolean,
  created_at timestamptz, reviewed_at timestamptz
) language sql stable security definer set search_path = public, auth as $$
  select
    v.id, coalesce(v.code, ''), v.disaster_id, coalesce(d.name, ''),
    v.full_name, v.phone, v.email, v.province, v.district,
    v.skills, v.availability, v.note,
    v.status, v.review_note,
    v.on_shift, v.shift_since,
    v.standing_contact_consent,
    v.created_at, v.reviewed_at
  from volunteer_applications v
  left join disasters d on d.id = v.disaster_id
  where auth.uid() is not null
    and lower(btrim(v.email)) = (select lower(btrim(u.email)) from auth.users u where u.id = auth.uid())
  order by v.created_at desc;
$$;
revoke all on function my_volunteer_applications() from public, anon;
grant execute on function my_volunteer_applications() to authenticated;

-- Note: the coordinator list reads `volunteer_applications` directly under the existing
-- coordinator policy, so it picks the new column up without a change here. What the
-- panel must do with it is show it — a permission nobody can see is a permission nobody
-- will use.
