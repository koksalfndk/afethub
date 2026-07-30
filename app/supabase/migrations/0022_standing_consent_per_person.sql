-- AfetHUB — migration 0022
-- "Aktif gönüllü" is a decision about the person, not about a form they filled in.
--
-- 0021 put the standing permission on each application row, so someone with three
-- applications had three switches for one question — and could end up half-consenting,
-- which is not a state that means anything when a coordinator is deciding whether they
-- may pick up the phone.
--
-- The column stays where it is (a coordinator reads it on the application in front of
-- them), but it is now written for every application the person has at once, and the
-- switch takes no application id. One answer, applied everywhere.
--
-- Additive and idempotent.
-- =============================================================================

-- The per-application version is dropped so a stale client cannot keep setting one row
-- and leave the rest disagreeing.
drop function if exists set_my_volunteer_consent(uuid, boolean);

create or replace function set_my_volunteer_consent(p_on boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_email text;
  v_name  text;
  v_rows  integer;
begin
  select lower(btrim(u.email)) into v_email from auth.users u where u.id = auth.uid();
  if v_email is null then
    raise exception 'not authorized';
  end if;

  update volunteer_applications v
     set standing_contact_consent = p_on,
         standing_consent_at = case when p_on then coalesce(v.standing_consent_at, now()) else null end
   where lower(btrim(v.email)) = v_email
     and v.standing_contact_consent is distinct from p_on;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return;
  end if;

  select full_name into v_name from volunteer_applications
   where lower(btrim(email)) = v_email order by created_at desc limit 1;

  -- One entry for the decision, not one per row: the person answered once.
  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (null, coalesce(nullif(v_name, ''), 'Gönüllü'),
          case when p_on then 'Aktif gönüllü izni verildi' else 'Aktif gönüllü izni geri alındı' end,
          coalesce(nullif(v_name, ''), v_email) || ' · ' || v_rows::text || ' başvuru',
          case when p_on then 'İzin yok' else 'İzinli' end,
          case when p_on then 'İzinli' else 'İzin yok' end, '#2A6FB0');
end $$;
revoke all on function set_my_volunteer_consent(boolean) from public, anon;
grant execute on function set_my_volunteer_consent(boolean) to authenticated;

-- Editing an application must not be able to contradict the person-level answer either,
-- so the update writes the flag across every row of that e-mail as well.
create or replace function update_my_volunteer_application(
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
  v_email  text;
begin
  select true, v.status, v.full_name, v.disaster_id, lower(btrim(v.email))
    into v_mine, v_before, v_name, v_did, v_email
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
    note         = btrim(coalesce(p_note, ''))
  where id = p_app;

  -- Person-level, every row.
  update volunteer_applications v
     set standing_contact_consent = coalesce(p_standing, false),
         standing_consent_at = case
           when coalesce(p_standing, false) then coalesce(v.standing_consent_at, now())
           else null end
   where lower(btrim(v.email)) = v_email;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (v_did, coalesce(nullif(btrim(p_full_name), ''), 'Gönüllü'),
          'Gönüllü başvurusu güncellendi', v_name, v_before::text, v_before::text, '#2A6FB0');
end $$;
revoke all on function update_my_volunteer_application(uuid, uuid, text, text, text, text, text[], text, text, boolean)
  from public, anon;
grant execute on function update_my_volunteer_application(uuid, uuid, text, text, text, text, text[], text, text, boolean)
  to authenticated;

-- A new application inherits the answer the person already gave, so filing a second one
-- cannot silently turn the permission off (or on) for the first.
create or replace function volunteer_inherit_consent()
returns trigger language plpgsql set search_path = public as $$
declare v_prev boolean;
begin
  select v.standing_contact_consent into v_prev
  from volunteer_applications v
  where lower(btrim(v.email)) = lower(btrim(new.email))
  order by v.created_at desc
  limit 1;

  if v_prev is not null and v_prev is distinct from new.standing_contact_consent then
    -- The person's existing answer wins, except when this form is turning it ON.
    if not new.standing_contact_consent then
      new.standing_contact_consent := v_prev;
    end if;
  end if;

  if new.standing_contact_consent then
    new.standing_consent_at := coalesce(new.standing_consent_at, now());
    -- Bring the older rows up to the new answer.
    update volunteer_applications v
       set standing_contact_consent = true,
           standing_consent_at = coalesce(v.standing_consent_at, now())
     where lower(btrim(v.email)) = lower(btrim(new.email))
       and v.standing_contact_consent = false;
  end if;
  return new;
end $$;

drop trigger if exists volunteer_inherit_consent_before_insert on volunteer_applications;
create trigger volunteer_inherit_consent_before_insert before insert on volunteer_applications
  for each row execute function volunteer_inherit_consent();

-- Existing data: bring every person's applications onto one answer — consent wins if it
-- was given anywhere, since that is the answer the person actually gave at some point.
update volunteer_applications v
   set standing_contact_consent = true,
       standing_consent_at = coalesce(v.standing_consent_at, now())
 where v.standing_contact_consent = false
   and exists (
     select 1 from volunteer_applications o
     where lower(btrim(o.email)) = lower(btrim(v.email))
       and o.standing_contact_consent
   );
