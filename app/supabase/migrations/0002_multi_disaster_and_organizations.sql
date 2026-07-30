-- AfetHUB — migration 0002
-- Multi-disaster dashboard + organization (kurum ve dernek) directory.
--
-- Additive and idempotent. Safe to run on an existing AfetHUB project; it does
-- not drop or rewrite any operational data.
--
-- Apply with: supabase db execute -f supabase/migrations/0002_multi_disaster_and_organizations.sql
--   (or paste into the SQL editor of the AfetHUB project)
--
-- NOT YET APPLIED to any project by the author of this file.
-- =============================================================================

-- ---------- 1) Disasters: type, province, legacy slugs, demo flag ------------
do $$ begin
  create type disaster_type as enum ('Wildfire','Flood','Earthquake','Storm','Evacuation','Other');
exception when duplicate_object then null; end $$;

alter table disasters
  add column if not exists type         disaster_type not null default 'Other',
  add column if not exists province     text          not null default '',
  -- Slugs are date-stamped ("seydikemer-orman-yangini-2026-07-21") so the same
  -- place can burn twice without a collision. Older URLs must keep resolving.
  add column if not exists legacy_slugs text[]        not null default '{}',
  -- Sample content must be labelled in the UI so it can never be mistaken for
  -- verified live disaster data (rules/07 §Seed Content).
  add column if not exists is_demo      boolean       not null default false;

create index if not exists disasters_status_updated_idx on disasters (status, updated_at desc);
create index if not exists disasters_legacy_slugs_idx   on disasters using gin (legacy_slugs);

-- Resolve a URL to a disaster by current slug or by any retired slug.
create or replace function disaster_by_slug(p_slug text)
returns setof disasters language sql stable as $$
  select * from disasters
  where slug = p_slug or p_slug = any(legacy_slugs)
  limit 1;
$$;

-- ---------- 2) National dashboard aggregates ---------------------------------
-- The home page reads per-disaster counters from here instead of recomputing
-- authoritative totals in the browser (rules/05 §Aggregates, CLAUDE.md
-- §Source of Truth).
create or replace view disaster_overview as
select
  d.id,
  d.slug,
  d.name,
  d.region,
  d.province,
  d.type,
  d.status,
  d.opened_at,
  d.updated_at,
  d.volunteers,
  d.on_shift,
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
  (select count(*) from locations l where l.disaster_id = d.id)                 as delivery_points
from disasters d;

grant select on disaster_overview to anon, authenticated;

-- ---------- 3) Organizations directory ---------------------------------------
do $$ begin
  create type org_status as enum ('Pending verification','Verified','Rejected');
exception when duplicate_object then null; end $$;

create table if not exists organizations (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(btrim(name)) between 2 and 160),
  kind               text not null default 'Dernek'
                     check (kind in ('Kamu kurumu','Belediye','Dernek','Vakıf','Meslek odası','Gönüllü grubu','Diğer')),
  scope              text not null default 'İl'
                     check (scope in ('Ulusal','Bölgesel','İl','İlçe')),
  province           text not null default '',
  district           text not null default '',
  services           text[] not null default '{}',
  description        text not null default '' check (length(description) <= 1200),
  website            text not null default '',
  email              text not null default '',
  phone              text not null default '',
  emergency_phone    text not null default '',
  address            text not null default '',
  -- A submission is public immediately but carries "Doğrulama bekliyor" until a
  -- coordinator verifies it. Rejected rows stay for audit and are never public.
  status             org_status not null default 'Pending verification',
  -- Only a coordinator may mark an entry as an official/public body. A visitor
  -- can never claim official affiliation (rules/03 §Legal and Safety Disclaimer).
  is_official        boolean not null default false,
  -- Submitter contact is operational data, never exposed publicly (rules/01).
  submitted_by_name  text not null default '',
  submitted_by_email text not null default '',
  submitted_by_phone text not null default '',
  verified_by        uuid references profiles(id) on delete set null,
  verified_at        timestamptz,
  reject_reason      text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists organizations_status_idx   on organizations (status, created_at desc);
create index if not exists organizations_province_idx on organizations (province);
create index if not exists organizations_kind_idx     on organizations (kind);
-- One entry per name+province; a duplicate submission should be merged, not stacked.
create unique index if not exists organizations_name_province_uniq
  on organizations (lower(btrim(name)), lower(btrim(province)));

-- Public projection: everything a visitor may see, and nothing else. The view
-- (not the table) is what anon reads, so submitter contact cannot leak.
create or replace view organizations_public as
select
  id, name, kind, scope, province, district, services, description,
  website, email, phone, emergency_phone, address,
  status, is_official, verified_at, created_at
from organizations
where status <> 'Rejected';

grant select on organizations_public to anon, authenticated;

alter table organizations enable row level security;

-- No public SELECT on the base table — the view above is the public surface.
drop policy if exists organizations_coord_read on organizations;
create policy organizations_coord_read on organizations
  for select using (is_coordinator());

-- A visitor may submit an entry, but only as unverified, unofficial and
-- unattributed. Verification fields are not writable from the client.
drop policy if exists organizations_public_insert on organizations;
create policy organizations_public_insert on organizations
  for insert with check (
    status = 'Pending verification'
    and is_official = false
    and verified_by is null
    and verified_at is null
    and reject_reason = ''
  );

drop policy if exists organizations_coord_write on organizations;
create policy organizations_coord_write on organizations
  for all using (is_coordinator()) with check (is_coordinator());

-- Verification is a coordinator action and is written to the audit log, like
-- every other status change in the system.
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

-- Abuse note: public insert is intentionally open (no account required, per
-- CLAUDE.md §Primary Product Rule). Rate limiting and bot protection must be
-- enforced at the edge/API layer, not here (rules/03 §Abuse Prevention).
