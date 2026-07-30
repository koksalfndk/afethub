-- AfetHUB — migration 0017
-- Four corrections that came out of using 0016 in production.
--
-- 1) The public feed must read the same for everyone. 0016 let a coordinator see extra
--    rows in the very same strip a visitor reads, so "canlı akış" meant two different
--    things depending on who was looking. The private rows now belong to ONE place: an
--    admin-only system log in the panel.
--
-- 2) An operation opened from a citizen report is the community's, whether the
--    threshold opened it or a coordinator published it by hand. The coordinator is the
--    reviewer, not the initiator — so both paths mark it as community-opened, and only
--    the hand-published one is confirmed on the spot.
--
-- 3) Volunteer figures were free-text numbers on the operation record. A coordinator
--    could type 168 with nobody behind it. They are now derived from approved volunteer
--    applications, and "şu an nöbette" is a real flag a coordinator sets per person.
--
-- Additive and idempotent.
-- =============================================================================

-- ---------- 1) Private audit rows are admin-only ------------------------------
-- Coordinators keep everything they need for operations: every operational action is
-- on the public allow-list. What moves behind is_admin() is the rest — role grants,
-- invitations, moderation rejections — which is what the panel's system log shows.
drop policy if exists audit_read on audit_log;
create policy audit_read on audit_log
  for select using (audit_is_public(action) or is_admin());

-- ---------- 2) A report-born operation belongs to the community ---------------
-- p_community now only decides whether it still needs confirming:
--   threshold        → opened by the community, NOT yet confirmed
--   coordinator publish → opened by the community, confirmed by that coordinator
create or replace function open_disaster_from_report(p_report uuid, p_community boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  r        disaster_reports;
  v_name   text;
  v_slug   text;
  v_try    text;
  v_n      integer := 1;
  v_id     uuid;
  v_region text;
begin
  select * into r from disaster_reports where id = p_report for update;
  if not found then raise exception 'report not found'; end if;
  if r.disaster_id is not null then
    return (select d.slug from disasters d where d.id = r.disaster_id);
  end if;

  v_name := coalesce(nullif(btrim(r.district), ''), btrim(r.province)) || ' ' || disaster_type_label(r.type);
  v_region := coalesce(nullif(btrim(r.district), '') || ', ', '') || btrim(r.province) || ' · Türkiye';

  v_slug := community_slugify(v_name) || '-' || to_char(now() at time zone 'utc', 'DD-MM-YYYY');
  v_try := v_slug;
  while exists (select 1 from disasters d where d.slug = v_try) loop
    v_n := v_n + 1;
    v_try := v_slug || '-' || v_n::text;
  end loop;

  insert into disasters (
    slug, name, region, province, type, status, situation, opened_at,
    opened_by_community, community_confirmed_at
  )
  values (
    v_try, v_name, v_region, btrim(r.province), r.type, 'Active',
    case when p_community
      then 'Bu operasyon, aynı olayı bildiren en az ' || community_report_threshold()::text ||
           ' kişinin doğrulamasıyla otomatik açıldı. Koordinatör doğrulaması bekleniyor.' ||
           coalesce(E'\n\n' || nullif(btrim(r.description), ''), '')
      else coalesce(nullif(btrim(r.description), ''), '') end,
    (now() at time zone 'utc')::date,
    true,
    -- Hand-published: a coordinator looked at the report and decided. That IS the
    -- confirmation, so the public page does not also ask for one.
    case when p_community then null else now() end
  )
  returning id into v_id;

  update disaster_reports set status = 'Published', disaster_id = v_id where id = p_report;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (
    v_id,
    case when p_community then 'Topluluk'
         else coalesce((select full_name from profiles where id = auth.uid()), 'Koordinatör') end,
    'Topluluk afeti oluşturuldu',
    v_name || ' · ' || r.report_count::text || ' kişi bildirdi',
    'Topluluk bildirimi',
    case when p_community then 'Afet · koordinatör doğrulaması bekleniyor' else 'Afet · koordinatör doğruladı' end,
    '#E6A700'
  );

  return v_try;
end $$;
revoke all on function open_disaster_from_report(uuid, boolean) from public, anon, authenticated;

-- The record published from the İzmir/Karaburun report before this fix carries
-- opened_by_community = false, so its page names AfetHUB's coordination team as the
-- initiator instead of the community that reported it. This corrects the metadata of
-- rows that are linked to a report; it touches no quantity and no submission.
update disasters d
   set opened_by_community = true,
       community_confirmed_at = coalesce(d.community_confirmed_at, now())
 where d.opened_by_community = false
   and exists (select 1 from disaster_reports r where r.disaster_id = d.id);

-- ---------- 3) Volunteers, counted rather than typed --------------------------
-- Who is on shift right now is an operational fact a coordinator sets on a real
-- application row. Without this flag the number could only ever be a guess.
alter table volunteer_applications
  add column if not exists on_shift boolean not null default false;
alter table volunteer_applications
  add column if not exists shift_since timestamptz;

comment on column volunteer_applications.on_shift is
  'Coordinator-set: this approved volunteer is on shift right now.';

create index if not exists volunteer_applications_disaster_idx
  on volunteer_applications (disaster_id, status);

-- Only an approved application may be on shift: "nöbette" would otherwise include
-- people nobody has reviewed (rules/01 §Clear Operational States).
create or replace function set_volunteer_shift(p_app uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_status volunteer_status; v_disaster uuid;
begin
  if not is_coordinator() then
    raise exception 'not authorized';
  end if;
  select full_name, status, disaster_id into v_name, v_status, v_disaster
  from volunteer_applications where id = p_app for update;
  if v_name is null then raise exception 'application not found'; end if;
  if p_on and v_status <> 'Approved' then
    raise exception 'only an approved volunteer can be on shift';
  end if;

  update volunteer_applications
     set on_shift = p_on,
         shift_since = case when p_on then now() else null end
   where id = p_app;

  -- Not on the public allow-list: this names a person.
  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (v_disaster, coalesce((select full_name from profiles where id = auth.uid()), 'Koordinatör'),
          case when p_on then 'Gönüllü nöbete alındı' else 'Gönüllü nöbetten çıktı' end,
          v_name, case when p_on then 'Nöbette değil' else 'Nöbette' end,
          case when p_on then 'Nöbette' else 'Nöbette değil' end, '#2A6FB0');
end $$;
revoke all on function set_volunteer_shift(uuid, boolean) from public, anon;
grant execute on function set_volunteer_shift(uuid, boolean) to authenticated;

-- `disasters.volunteers` / `disasters.on_shift` stay on the table (older rows carry
-- seed values) but nothing reads them any more: the view counts real applications.
-- Casting to int keeps the view's column types, which `create or replace view`
-- requires.
create or replace view disaster_overview as
select
  d.id, d.slug, d.name, d.region, d.province, d.type, d.status,
  d.opened_at, d.updated_at,
  (select count(*)::int from volunteer_applications v
     where v.disaster_id = d.id and v.status = 'Approved')                      as volunteers,
  (select count(*)::int from volunteer_applications v
     where v.disaster_id = d.id and v.status = 'Approved' and v.on_shift)       as on_shift,
  d.is_demo,
  (select count(*) from needs n
     where n.disaster_id = d.id and n.remaining_qty > 0)                        as active_needs,
  (select count(*) from needs n
     where n.disaster_id = d.id and n.remaining_qty = 0)                        as completed_needs,
  (select count(*) from submissions s
     where s.disaster_id = d.id and s.status = 'Pending verification')          as pending_submissions,
  (select coalesce(sum(s.qty), 0) from submissions s
     where s.disaster_id = d.id and s.status = 'Pending verification')          as pending_units,
  (select count(*) from submissions s
     where s.disaster_id = d.id
       and s.status in ('Verified','Partially verified'))                       as verified_submissions,
  (select count(*) from locations l where l.disaster_id = d.id)                 as delivery_points,
  d.situation,
  d.legacy_slugs,
  d.opened_by_org_id,
  d.opened_by_community,
  d.community_confirmed_at
from disasters d;

grant select on disaster_overview to anon, authenticated;

-- ---------- Notes --------------------------------------------------------------
--   * The volunteer figures will read 0 until real applications are approved. That is
--     the point: a typed-in 168 was a number with nobody behind it.
--   * `set_volunteer_shift` has no automatic end. A shift that is never closed will
--     keep counting, so the panel shows `shift_since` next to the person.
--   * The public pages still read the counts only; who the volunteers are stays behind
--     is_coordinator() on volunteer_applications (migration 0013).
