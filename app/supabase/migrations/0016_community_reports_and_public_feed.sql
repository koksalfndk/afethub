-- AfetHUB — migration 0016
-- Two things that belong together: what the public live feed is allowed to say, and
-- what a community report can become.
--
-- 1) The feed was reading `audit_log` with a `using (true)` policy, so every visitor
--    could read rows such as "Yetki daveti oluşturuldu · soysalgzdee@gmail.com" —
--    invited people's e-mail addresses on a public page (rules/01 §Public Access:
--    never expose contributor e-mail addresses; rules/03 §Audit Log). Filtering that
--    in React would not have fixed it: the rows were still served by the API. The fix
--    is at the row level, and it is default-deny — an action nobody has listed as
--    public stays coordinator-only.
--
-- 2) "Ben de bildiriyorum" incremented a public counter with no identity attached, so
--    one person could have driven it to any number. It now requires a name, an e-mail
--    and a location, and one e-mail counts once per report (unique constraint, not a
--    client-side check). Only then does the 10-confirmation threshold that opens an
--    operation mean anything.
--
-- Additive and idempotent.
-- =============================================================================

-- ---------- 1) What the public may read from the audit log -------------------
-- Allow-list, not deny-list: a new action type is invisible to visitors until someone
-- decides it is publishable. Getting that default wrong is how the invite e-mails
-- ended up on the dashboard in the first place.
create or replace function audit_is_public(p_action text)
returns boolean language sql immutable set search_path = public as $$
  select p_action = any (array[
    -- Operational facts that the pages below the feed already publish.
    'İhtiyaç oluşturuldu', 'Miktar güncellendi', 'İhtiyaç tamamlandı', 'Need completed',
    'Teslimat bildirildi', 'Teslimat doğrulandı', 'Teslimat kısmen doğrulandı', 'Teslimat reddedildi',
    'Delivery verified', 'Delivery partially verified', 'Delivery rejected',
    'Duyuru yayınlandı', 'Duyuru güncellendi', 'Duyuru kaldırıldı',
    'Teslim noktası eklendi', 'Teslim noktası güncellendi', 'Teslim noktası kaldırıldı',
    -- Operations.
    'Afet oluşturuldu', 'Afet durumu güncellendi', 'Operasyon açıldı', 'Afet kaydı güncellendi',
    'Topluluk afeti oluşturuldu', 'Topluluk afeti doğrulandı',
    -- Directory. "Kurum reddedildi" is deliberately absent: a rejection is a
    -- moderation decision about a named organization, not public information.
    'Kurum eklendi', 'Kurum doğrulandı',
    -- Community reports. The counter is public; who reported is not.
    'Afet bildirimi gönderildi', 'Afet bildirimi birleştirildi', 'Afet bildirimi doğrulandı'
  ]);
$$;

-- Everything role-, invite- and moderation-related now falls outside this policy and
-- is readable only by coordinators. Coordinators keep the complete log — the audit
-- trail itself is unchanged; only who may read which row is.
drop policy if exists audit_read on audit_log;
create policy audit_read on audit_log
  for select using (audit_is_public(action) or is_coordinator());

-- ---------- 2) A community operation, and its verification state -------------
-- `opened_by_org_id` answers "which listed institution started this". A community
-- operation was started by nobody in the directory, so it needs its own flag rather
-- than a fake organization row.
alter table disasters
  add column if not exists opened_by_community boolean not null default false;
-- Null while the operation still rests on unverified claims. The public label comes
-- off the moment a coordinator confirms, and the timestamp is what records that.
alter table disasters
  add column if not exists community_confirmed_at timestamptz;

comment on column disasters.opened_by_community is
  'Opened automatically from corroborated citizen reports; initiator is shown as "Topluluk".';
comment on column disasters.community_confirmed_at is
  'Set when a coordinator confirms a community-opened operation; null = still unverified.';

-- ---------- 3) Who confirmed a report ----------------------------------------
-- One row per person per report. The unique constraint IS the de-duplication: a
-- second attempt from the same address raises unique_violation, which the RPC turns
-- into "you have already confirmed this" instead of a silent extra count.
--
-- The e-mail is NOT verified, so this is a speed bump, not proof of identity. It is
-- the same standing the reporter contact table has, and the reason the counter is
-- still labelled "kişi bildirdi" and never "doğrulandı" on public pages.
create table if not exists disaster_report_confirmations (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references disaster_reports(id) on delete cascade,
  name       text not null default '' check (length(btrim(name)) between 3 and 80),
  email      text not null check (position('@' in email) > 1 and length(email) <= 160),
  province   text not null default '' check (length(btrim(province)) between 2 and 60),
  district   text not null default '',
  created_at timestamptz not null default now()
);

do $$ begin
  alter table disaster_report_confirmations
    add constraint disaster_report_confirmations_once unique (report_id, email);
exception when duplicate_object then null; end $$;

create index if not exists disaster_report_confirmations_report_idx
  on disaster_report_confirmations (report_id);

alter table disaster_report_confirmations enable row level security;
-- No insert policy on purpose: the only write path is the SECURITY DEFINER RPC below,
-- which validates the contact details. Reads are coordinator-only — this table holds
-- names and e-mail addresses (rules/01 §Public Access).
drop policy if exists disaster_report_confirmations_coord on disaster_report_confirmations;
create policy disaster_report_confirmations_coord on disaster_report_confirmations
  for select using (is_coordinator());

-- ---------- 4) The threshold --------------------------------------------------
-- One definition, so the panel, the card and the trigger cannot disagree. The client
-- mirrors this as COMMUNITY_THRESHOLD in src/data/repo.ts — change both together.
create or replace function community_report_threshold()
returns integer language sql immutable set search_path = public as $$ select 10 $$;

-- ---------- 5) Slug and name for an auto-opened operation ---------------------
-- Mirrors disasterSlug() in src/data/repo.ts: name + dd-mm-yyyy, so the same place
-- burning twice never collides. Turkish letters are folded BEFORE lower(), because
-- lower('İ') produces a combining dot in some collations.
create or replace function community_slugify(p_text text)
returns text language sql immutable set search_path = public as $$
  select trim(both '-' from regexp_replace(
    lower(translate(p_text, 'ÇçĞğİıÖöŞşÜüI', 'CcGgIiOoSsUuI')),
    '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function disaster_type_label(p_type disaster_type)
returns text language sql immutable set search_path = public as $$
  select case p_type
    when 'Wildfire'   then 'Orman Yangını'
    when 'Flood'      then 'Sel ve Taşkın'
    when 'Earthquake' then 'Deprem'
    when 'Storm'      then 'Şiddetli Hava'
    when 'Evacuation' then 'Tahliye'
    else 'Afet' end;
$$;

-- ---------- 6) Turning a report into an operation ----------------------------
-- Shared by both paths so they cannot drift: the community threshold (p_community =
-- true, initiator "Topluluk", visibly unverified) and a coordinator publishing by
-- hand (p_community = false, initiator = the coordinator's own record).
--
-- Internal: not granted to anyone. It is called from within the two RPCs below, which
-- are where authorization lives.
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

  insert into disasters (slug, name, region, province, type, status, situation, opened_at, opened_by_community)
  values (
    v_try, v_name, v_region, btrim(r.province), r.type, 'Active',
    case when p_community
      then 'Bu operasyon, aynı olayı bildiren en az ' || community_report_threshold()::text ||
           ' kişinin doğrulamasıyla otomatik açıldı. Koordinatör doğrulaması bekleniyor.' ||
           coalesce(E'\n\n' || nullif(btrim(r.description), ''), '')
      else coalesce(nullif(btrim(r.description), ''), '') end,
    (now() at time zone 'utc')::date,
    p_community
  )
  returning id into v_id;

  update disaster_reports set status = 'Published', disaster_id = v_id where id = p_report;

  -- The community path writes its own entry (and the disasters trigger stays quiet for
  -- it), so the feed says who opened the operation instead of naming a coordinator who
  -- did not.
  if p_community then
    insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
    values (v_id, 'Topluluk', 'Topluluk afeti oluşturuldu',
            v_name || ' · ' || r.report_count::text || ' kişi bildirdi',
            'Topluluk bildirimi', 'Afet · koordinatör doğrulaması bekleniyor', '#E6A700');
  end if;

  return v_try;
end $$;
revoke all on function open_disaster_from_report(uuid, boolean) from public, anon, authenticated;

-- ---------- 7) Confirming a report -------------------------------------------
-- Replaces the anonymous one-argument version, which is dropped so a stale client
-- cannot keep calling the path that raised the counter with no identity at all.
drop function if exists confirm_disaster_report(uuid);

create or replace function confirm_disaster_report(
  p_report   uuid,
  p_name     text,
  p_email    text,
  p_province text,
  p_district text default ''
) returns table (
  id uuid, type disaster_type, province text, district text, location_note text,
  occurred_on date, description text, report_count integer, status report_status,
  disaster_slug text, created_at timestamptz, last_report_at timestamptz,
  merged boolean, already boolean, created_slug text
) language plpgsql security definer set search_path = public as $$
declare
  v_email  text := lower(btrim(p_email));
  v_before integer;
  v_count  integer;
  v_did    uuid;
  v_slug   text := '';
  v_already boolean := false;
begin
  if length(btrim(p_name)) < 3 then raise exception 'name required'; end if;
  if position('@' in v_email) < 2 or length(v_email) > 160 then raise exception 'email required'; end if;
  if length(btrim(p_province)) < 2 then raise exception 'province required'; end if;

  select r.report_count, r.disaster_id into v_before, v_did
  from disaster_reports r
  where r.id = p_report and r.status = 'Pending verification'
  for update;
  if v_before is null then
    raise exception 'report not open';
  end if;

  begin
    insert into disaster_report_confirmations (report_id, name, email, province, district)
    values (p_report, btrim(p_name), v_email, btrim(p_province), btrim(p_district));
  exception when unique_violation then
    v_already := true;
  end;

  if not v_already then
    update disaster_reports r
      set report_count = r.report_count + 1, last_report_at = now()
      where r.id = p_report
      returning r.report_count into v_count;

    -- The actor is the crowd, never the person: this row is read by anyone who opens
    -- the dashboard (rules/03 §Contact Information).
    insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
    select r.disaster_id, 'Topluluk', 'Afet bildirimi doğrulandı',
           r.province || coalesce(' / ' || nullif(r.district, ''), '') || ' · ' || disaster_type_label(r.type),
           v_before::text || ' kişi bildirdi', v_count::text || ' kişi bildirdi', '#E6A700'
    from disaster_reports r where r.id = p_report;

    if v_count >= community_report_threshold() and v_did is null then
      v_slug := open_disaster_from_report(p_report, true);
    end if;
  end if;

  return query
    select v.id, v.type, v.province, v.district, v.location_note, v.occurred_on, v.description,
           v.report_count, v.status, v.disaster_slug, v.created_at, v.last_report_at,
           false, v_already, v_slug
    from disaster_reports_public v where v.id = p_report;
end $$;
grant execute on function confirm_disaster_report(uuid, text, text, text, text) to anon, authenticated;

-- ---------- 8) The reporter's name stays out of the public feed --------------
-- Same function as 0003 with one change: the audit actor is 'Vatandaş' instead of the
-- reporter's own name. The name is still stored in disaster_report_contacts, where
-- only coordinators can read it.
create or replace function submit_disaster_report(
  p_type          disaster_type,
  p_province      text,
  p_district      text,
  p_location_note text,
  p_occurred_on   date,
  p_description   text,
  p_name          text,
  p_email         text,
  p_phone         text
) returns table (
  id uuid, type disaster_type, province text, district text, location_note text,
  occurred_on date, description text, report_count integer, status report_status,
  disaster_slug text, created_at timestamptz, last_report_at timestamptz, merged boolean
) language plpgsql security definer set search_path = public as $$
declare
  v_existing uuid;
  v_id       uuid;
  v_merged   boolean := false;
  v_before   integer;
begin
  if length(btrim(p_description)) = 0 then
    raise exception 'description required';
  end if;

  v_existing := find_same_event_report(p_type, p_province, p_district, p_occurred_on);

  if v_existing is not null then
    select r.report_count into v_before from disaster_reports r where r.id = v_existing for update;
    update disaster_reports r set
      report_count   = r.report_count + 1,
      last_report_at = now(),
      district       = case when btrim(r.district) = '' then btrim(p_district) else r.district end
    where r.id = v_existing;
    v_id := v_existing;
    v_merged := true;
  else
    insert into disaster_reports (type, province, district, location_note, occurred_on, description)
    values (p_type, btrim(p_province), btrim(p_district), btrim(p_location_note), p_occurred_on, btrim(p_description))
    returning disaster_reports.id into v_id;
    v_before := 0;
  end if;

  insert into disaster_report_contacts (report_id, name, email, phone)
  values (v_id, btrim(p_name), btrim(p_email), btrim(p_phone));

  -- The person who opens a report also counts as one confirmation, so the same
  -- address cannot open a report and then "confirm" it a second time.
  if btrim(p_email) <> '' and position('@' in btrim(p_email)) > 1 then
    insert into disaster_report_confirmations (report_id, name, email, province, district)
    values (v_id,
            case when length(btrim(p_name)) >= 3 then btrim(p_name) else 'Bildiren' end,
            lower(btrim(p_email)), btrim(p_province), btrim(p_district))
    on conflict (report_id, email) do nothing;
  end if;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  select
    r.disaster_id, 'Vatandaş',
    case when v_merged then 'Afet bildirimi birleştirildi' else 'Afet bildirimi gönderildi' end,
    r.province || coalesce(' / ' || nullif(r.district, ''), '') || ' · ' || disaster_type_label(r.type),
    case when v_merged then v_before::text || ' kişi bildirdi' else '—' end,
    r.report_count::text || ' kişi bildirdi',
    '#E6A700'
  from disaster_reports r where r.id = v_id;

  return query
    select v.id, v.type, v.province, v.district, v.location_note, v.occurred_on, v.description,
           v.report_count, v.status, v.disaster_slug, v.created_at, v.last_report_at, v_merged
    from disaster_reports_public v where v.id = v_id;
end $$;

-- ---------- 9) The coordinator's view of the queue ---------------------------
-- security_invoker: the caller's own RLS decides what they may read, so this view
-- cannot become a way around the coordinator-only policy on the base table. The
-- is_coordinator() guard is belt and braces.
drop view if exists disaster_reports_admin;
create view disaster_reports_admin with (security_invoker = true) as
select
  r.id, r.type, r.province, r.district, r.location_note, r.occurred_on, r.description,
  r.report_count, r.status, r.reject_reason, r.created_at, r.last_report_at,
  d.id   as disaster_id,
  d.slug as disaster_slug,
  d.opened_by_community,
  d.community_confirmed_at,
  (select count(*) from disaster_report_confirmations c where c.report_id = r.id) as confirmations,
  (select count(*) from disaster_report_contacts ct where ct.report_id = r.id)     as contacts
from disaster_reports r
left join disasters d on d.id = r.disaster_id
where is_coordinator();
grant select on disaster_reports_admin to authenticated;

-- ---------- 10) Coordinator decisions ----------------------------------------
-- publish: open the operation now, without waiting for the threshold.
-- reject:  close the report with a reason. It stops appearing publicly
--          (disaster_reports_public filters Rejected) but the row is kept.
create or replace function review_disaster_report(
  p_report uuid, p_action text, p_reason text default ''
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_slug text;
  r      disaster_reports;
begin
  if not is_coordinator() then
    raise exception 'not authorized';
  end if;
  select * into r from disaster_reports where id = p_report;
  if not found then raise exception 'report not found'; end if;

  if p_action = 'publish' then
    if r.status = 'Rejected' then raise exception 'report rejected'; end if;
    v_slug := open_disaster_from_report(p_report, false);
    return v_slug;
  elsif p_action = 'reject' then
    if length(btrim(p_reason)) < 5 then raise exception 'reason required'; end if;
    if r.disaster_id is not null then raise exception 'report already published'; end if;
    update disaster_reports set status = 'Rejected', reject_reason = btrim(p_reason) where id = p_report;
    -- Not in the public allow-list: rejecting a claim is a moderation decision.
    insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
    values (null, coalesce((select full_name from profiles where id = auth.uid()), 'Koordinatör'),
            'Afet bildirimi reddedildi',
            r.province || coalesce(' / ' || nullif(r.district, ''), ''),
            r.status::text, 'Rejected', '#D9363E');
    return '';
  end if;
  raise exception 'invalid action';
end $$;
revoke all on function review_disaster_report(uuid, text, text) from public, anon;
grant execute on function review_disaster_report(uuid, text, text) to authenticated;

-- A coordinator confirming a community-opened operation is what removes the public
-- "koordinatör doğrulaması bekleniyor" label. Nothing else clears it.
create or replace function confirm_community_disaster(p_disaster uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not is_coordinator() then
    raise exception 'not authorized';
  end if;
  update disasters set community_confirmed_at = now(), updated_at = now()
  where id = p_disaster and opened_by_community and community_confirmed_at is null
  returning name into v_name;
  if v_name is null then raise exception 'not a pending community operation'; end if;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (p_disaster, coalesce((select full_name from profiles where id = auth.uid()), 'Koordinatör'),
          'Topluluk afeti doğrulandı', v_name, 'Doğrulama bekliyor', 'Koordinatör doğruladı', '#159947');
  return v_name;
end $$;
revoke all on function confirm_community_disaster(uuid) from public, anon;
grant execute on function confirm_community_disaster(uuid) to authenticated;

-- ---------- 11) Feed entries for operations and the directory ----------------
-- Written by triggers rather than by each call site, so an operation opened from the
-- panel, from a report or by a seed script all produce the same entry.
create or replace function disasters_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    -- The community path writes a more specific entry itself.
    if new.opened_by_community then return new; end if;
    insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
    values (new.id, coalesce((select full_name from profiles where id = auth.uid()), 'Koordinatör'),
            'Afet oluşturuldu',
            new.name || coalesce(' · ' || nullif(new.province, ''), ''),
            '—', new.status::text, '#D9363E');
  elsif new.status is distinct from old.status then
    insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
    values (new.id, coalesce((select full_name from profiles where id = auth.uid()), 'Koordinatör'),
            'Afet durumu güncellendi',
            new.name || coalesce(' · ' || nullif(new.province, ''), ''),
            old.status::text, new.status::text,
            case new.status when 'Active' then '#D9363E' when 'Resolved' then '#159947' else '#5A7184' end);
  end if;
  return new;
end $$;

drop trigger if exists disasters_audit_insert on disasters;
create trigger disasters_audit_insert after insert on disasters
  for each row execute function disasters_audit();
drop trigger if exists disasters_audit_update on disasters;
create trigger disasters_audit_update after update of status on disasters
  for each row execute function disasters_audit();

-- A new directory record is public information (name, kind, province) and it is the
-- one moment the directory visibly grows. Verification already has its own entry in
-- verify_organization(), so this trigger only covers the insert.
create or replace function organizations_audit_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (null, coalesce((select full_name from profiles where id = auth.uid()), 'Ziyaretçi'),
          'Kurum eklendi',
          new.name || coalesce(' · ' || nullif(new.province, ''), ''),
          '—', new.status::text, '#2A6FB0');
  return new;
end $$;

drop trigger if exists organizations_audit_insert on organizations;
create trigger organizations_audit_insert after insert on organizations
  for each row execute function organizations_audit_insert();

-- ---------- 12) Keep the dashboard view in step ------------------------------
-- Same reason as 0011: a column on the table but not on the view silently maps to
-- null, so an operation would lose its community flag depending on which query loaded
-- it. Appended at the end — `create or replace view` may only add trailing columns.
create or replace view disaster_overview as
select
  d.id, d.slug, d.name, d.region, d.province, d.type, d.status,
  d.opened_at, d.updated_at, d.volunteers, d.on_shift, d.is_demo,
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

-- ---------- Verification notes ------------------------------------------------
-- What this migration does NOT claim:
--   * The e-mail on a confirmation is not verified. The counter is corroboration, not
--     proof, and every public surface must keep calling it "kişi bildirdi".
--   * An auto-opened operation is published immediately and carries
--     `community_confirmed_at is null`. Every screen that shows it must show that it
--     is waiting for coordinator verification (rules/01 §Clear Operational States).
--   * Rate limiting and bot protection are still not implemented here; they belong at
--     the edge (rules/03 §Abuse Prevention).
