-- AfetHUB — migration 0003
-- Citizen disaster reports with server-side de-duplication.
--
-- A report is a CLAIM, never an operation. Reports describing the same event are
-- merged into one row whose `report_count` is what the dashboard shows as
-- "n kişi bildirdi". A coordinator turns a sufficiently corroborated report into a
-- real disaster; nothing is published automatically (rules/02 §Need Requests).
--
-- Additive and idempotent. NOT YET APPLIED to any project by the author.
-- =============================================================================

do $$ begin
  create type report_status as enum ('Pending verification','Merged','Published','Rejected');
exception when duplicate_object then null; end $$;

create table if not exists disaster_reports (
  id             uuid primary key default gen_random_uuid(),
  type           disaster_type not null,
  province       text not null check (length(btrim(province)) between 2 and 60),
  district       text not null default '',
  location_note  text not null default '' check (length(location_note) <= 240),
  occurred_on    date not null,
  description    text not null default '' check (length(description) <= 1200),
  report_count   integer not null default 1 check (report_count >= 1),
  status         report_status not null default 'Pending verification',
  -- Set when a coordinator opens an operation from this report.
  disaster_id    uuid references disasters(id) on delete set null,
  reject_reason  text not null default '',
  created_at     timestamptz not null default now(),
  last_report_at timestamptz not null default now(),
  constraint occurred_on_not_future check (occurred_on <= (now() at time zone 'utc')::date)
);

create index if not exists disaster_reports_match_idx
  on disaster_reports (type, lower(btrim(province)), occurred_on)
  where status = 'Pending verification';
create index if not exists disaster_reports_open_idx
  on disaster_reports (status, report_count desc, last_report_at desc);

-- Reporter contact lives in its own table: it is operational data, it must never be
-- exposed publicly, and one report legitimately has many reporters.
create table if not exists disaster_report_contacts (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references disaster_reports(id) on delete cascade,
  name       text not null default '',
  email      text not null default '',
  phone      text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists disaster_report_contacts_report_idx on disaster_report_contacts (report_id);

-- Public projection: the claim, never the claimants.
create or replace view disaster_reports_public as
select
  r.id, r.type, r.province, r.district, r.location_note, r.occurred_on, r.description,
  r.report_count, r.status, r.created_at, r.last_report_at,
  d.slug as disaster_slug
from disaster_reports r
left join disasters d on d.id = r.disaster_id
where r.status <> 'Rejected';

grant select on disaster_reports_public to anon, authenticated;

alter table disaster_reports          enable row level security;
alter table disaster_report_contacts  enable row level security;

-- The base tables are coordinator-only; writes go through the RPCs below.
drop policy if exists disaster_reports_coord_read on disaster_reports;
create policy disaster_reports_coord_read on disaster_reports
  for select using (is_coordinator());
drop policy if exists disaster_reports_coord_write on disaster_reports;
create policy disaster_reports_coord_write on disaster_reports
  for all using (is_coordinator()) with check (is_coordinator());
drop policy if exists disaster_report_contacts_coord on disaster_report_contacts;
create policy disaster_report_contacts_coord on disaster_report_contacts
  for all using (is_coordinator()) with check (is_coordinator());

-- ---------- The merge rule ---------------------------------------------------
-- Same event  ==  same type
--              AND same province
--              AND (same district OR one side left it blank)
--              AND observed within 2 days of each other.
-- This mirrors `isSameEvent()` in src/data/repo.ts exactly. Change both together.
create or replace function find_same_event_report(
  p_type disaster_type, p_province text, p_district text, p_occurred_on date
) returns uuid language sql stable security definer set search_path = public as $$
  select r.id
  from disaster_reports r
  where r.status = 'Pending verification'
    and r.type = p_type
    and lower(btrim(r.province)) = lower(btrim(p_province))
    and (
      btrim(r.district) = '' or btrim(p_district) = ''
      or lower(btrim(r.district)) = lower(btrim(p_district))
    )
    and abs(r.occurred_on - p_occurred_on) <= 2
  order by r.report_count desc, r.last_report_at desc
  limit 1;
$$;

-- Insert-or-merge, transactionally. Racing submissions cannot create duplicates:
-- the row is locked before its counter is raised.
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
      -- Keep the first location note; append nothing, so one reporter cannot
      -- rewrite another's description.
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

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  select
    r.disaster_id,
    coalesce(nullif(btrim(p_name), ''), 'Misafir'),
    case when v_merged then 'Afet bildirimi birleştirildi' else 'Afet bildirimi gönderildi' end,
    r.province || coalesce(' / ' || nullif(r.district, ''), '') || ' · ' || r.type::text,
    case when v_merged then v_before::text || ' kişi bildirdi' else '—' end,
    r.report_count::text || ' kişi bildirdi',
    '#E6A700'
  from disaster_reports r where r.id = v_id;

  return query
    select v.id, v.type, v.province, v.district, v.location_note, v.occurred_on, v.description,
           v.report_count, v.status, v.disaster_slug, v.created_at, v.last_report_at, v_merged
    from disaster_reports_public v where v.id = v_id;
end $$;

-- "Ben de bildiriyorum" on a report the reporter found in the list.
create or replace function confirm_disaster_report(p_report uuid)
returns table (
  id uuid, type disaster_type, province text, district text, location_note text,
  occurred_on date, description text, report_count integer, status report_status,
  disaster_slug text, created_at timestamptz, last_report_at timestamptz, merged boolean
) language plpgsql security definer set search_path = public as $$
declare v_before integer;
begin
  select r.report_count into v_before from disaster_reports r
  where r.id = p_report and r.status = 'Pending verification' for update;
  if v_before is null then
    raise exception 'report not open';
  end if;

  update disaster_reports r set report_count = r.report_count + 1, last_report_at = now()
  where r.id = p_report;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  select r.disaster_id, 'Misafir', 'Afet bildirimi doğrulandı',
         r.province || coalesce(' / ' || nullif(r.district, ''), '') || ' · ' || r.type::text,
         v_before::text || ' kişi bildirdi', r.report_count::text || ' kişi bildirdi', '#E6A700'
  from disaster_reports r where r.id = p_report;

  return query
    select v.id, v.type, v.province, v.district, v.location_note, v.occurred_on, v.description,
           v.report_count, v.status, v.disaster_slug, v.created_at, v.last_report_at, false
    from disaster_reports_public v where v.id = p_report;
end $$;

grant execute on function submit_disaster_report(disaster_type, text, text, text, date, text, text, text, text)
  to anon, authenticated;
grant execute on function confirm_disaster_report(uuid) to anon, authenticated;
revoke all on function find_same_event_report(disaster_type, text, text, date) from public, anon;

-- Abuse note: both RPCs are callable without an account (CLAUDE.md §Primary Product
-- Rule). `report_count` is therefore a claim counter and must never be presented as
-- verification. Rate limiting, bot protection and one-confirmation-per-device belong
-- at the edge/API layer (rules/03 §Abuse Prevention) and are NOT implemented here.
