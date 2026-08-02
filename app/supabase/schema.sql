-- AfetHUB — Supabase schema (ready to apply)
-- =============================================================================
-- This file is the single source of truth for the AfetHUB database. It is safe
-- to apply to a NEW, dedicated AfetHUB Supabase project. It must NEVER be
-- applied to a PatiBase project — AfetHUB is fully independent (see CLAUDE.md).
--
-- Core invariant (enforced here, not only in the client):
--     remaining = required_qty - verified_qty      (never below 0)
--     pending deliveries NEVER reduce remaining
-- Only a coordinator approval raises verified_qty. Every quantity-changing
-- action is transactional and recorded in an immutable audit log.
--
-- Apply with: supabase db execute -f supabase/schema.sql
--   (or paste into the SQL editor of the AfetHUB project)
-- =============================================================================

-- ---------- Extensions -------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------- Enums ------------------------------------------------------------
do $$ begin
  create type need_priority as enum ('Critical','Urgent','Normal','Paused','Completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type submission_status as enum (
    'Pending verification','Verified','Partially verified','Rejected','Information requested'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type disaster_status as enum ('Active','Resolved','Archived');
exception when duplicate_object then null; end $$;

-- ---------- Profiles / roles -------------------------------------------------
-- A profile row is created for every authenticated user. Only 'coordinator'
-- and 'admin' may verify deliveries or manage needs. The public never
-- authenticates for the core flows.
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  role        text not null default 'volunteer'
              check (role in ('volunteer','coordinator','admin')),
  created_at  timestamptz not null default now()
);

create or replace function is_coordinator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role in ('coordinator','admin')
  );
$$;

-- ---------- Disasters --------------------------------------------------------
create table if not exists disasters (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  region       text not null default '',
  status       disaster_status not null default 'Active',
  situation    text not null default '',
  opened_at    date,
  volunteers   integer not null default 0,
  on_shift     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- Self-healing: if an older disasters table already existed, add the new columns.
alter table disasters add column if not exists slug       text;
alter table disasters add column if not exists volunteers integer not null default 0;
alter table disasters add column if not exists on_shift   integer not null default 0;
update disasters set slug = 'afet-' || left(id::text, 8) where slug is null or slug = '';
create unique index if not exists disasters_slug_key on disasters (slug);

-- ---------- Delivery locations ----------------------------------------------
create table if not exists locations (
  id            uuid primary key default gen_random_uuid(),
  disaster_id   uuid not null references disasters(id) on delete cascade,
  name          text not null,
  address       text not null default '',
  hours         text not null default '',
  accepts       text not null default '',
  contact_name  text not null default '',
  contact_phone text not null default '',
  status        text not null default '',
  lat           numeric(9,6),
  lng           numeric(9,6),
  created_at    timestamptz not null default now()
);

-- ---------- Needs ------------------------------------------------------------
-- remaining_qty is a GENERATED column: the client can never desynchronise it.
create table if not exists needs (
  id            uuid primary key default gen_random_uuid(),
  disaster_id   uuid not null references disasters(id) on delete cascade,
  name          text not null,
  category      text not null default '',
  priority      need_priority not null default 'Normal',
  required_qty  integer not null check (required_qty >= 0),
  verified_qty  integer not null default 0 check (verified_qty >= 0),
  pending_qty   integer not null default 0 check (pending_qty >= 0),
  unit          text not null default 'units',
  location_id   uuid references locations(id) on delete set null,
  location_name text not null default '',
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  remaining_qty integer generated always as (greatest(0, required_qty - verified_qty)) stored
);

-- ---------- Submissions (reported deliveries) --------------------------------
create table if not exists submissions (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  disaster_id       uuid not null references disasters(id) on delete cascade,
  need_id           uuid not null references needs(id) on delete cascade,
  contributor_name  text not null,
  contributor_email text not null,
  contributor_phone text not null,
  city              text not null default '',
  qty               integer not null check (qty >= 1),
  unit              text not null default 'units',
  location_name     text not null default '',
  status            submission_status not null default 'Pending verification',
  verified_qty      integer,
  note              text not null default '',
  submitted_at      timestamptz not null default now(),
  -- Teslimat fotoğrafı. Bu sütun BURADA duruyor çünkü aşağıdaki `track_submission()`
  -- onu okuyor: `storage.sql` içinde eklendiği sürece `schema.sql` temiz bir
  -- veritabanına tek başına uygulanamıyordu ("column s.photo_url does not exist",
  -- satır ~334) ve dosyanın geri kalanı sessizce çalışmadan kalıyordu. `storage.sql`
  -- aynı sütunu `add column if not exists` ile eklemeye devam ediyor; orası artık
  -- etkisiz bir tekrar ve mevcut kurulumları bozmuyor.
  photo_url         text
);
-- Aynı gerekçeyle: profil avatarı da burada tanımlı. `storage.sql` kovaları ve
-- politikaları kurar; SÜTUNLAR şemanın parçasıdır ve şema kendi kendine yeterli olmalı.
alter table profiles add column if not exists avatar_url text;
create index if not exists submissions_code_idx on submissions (upper(code));
create index if not exists submissions_status_idx on submissions (status);

-- ---------- Public need requests --------------------------------------------
create table if not exists need_requests (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  disaster_id  uuid references disasters(id) on delete set null,
  category     text not null default '',
  title        text not null,
  description  text not null default '',
  qty          integer,
  unit         text not null default '',
  priority     need_priority not null default 'Critical',
  location_name text not null default '',
  name         text not null default '',
  email        text not null default '',
  phone        text not null default '',
  city         text not null default '',
  status       text not null default 'Waiting for verification',
  created_at   timestamptz not null default now()
);

-- ---------- Announcements ----------------------------------------------------
create table if not exists announcements (
  id           uuid primary key default gen_random_uuid(),
  disaster_id  uuid not null references disasters(id) on delete cascade,
  kind         text not null default '',
  accent       text not null default '#102A43',
  author       text not null default '',
  title        text not null,
  body         text not null default '',
  created_at   timestamptz not null default now()
);

-- ---------- Immutable audit log ---------------------------------------------
create table if not exists audit_log (
  id           uuid primary key default gen_random_uuid(),
  disaster_id  uuid references disasters(id) on delete set null,
  actor        text not null default 'System',
  action       text not null,
  detail       text not null default '',
  old_value    text not null default '—',
  new_value    text not null default '',
  color        text not null default '#102A43',
  created_at   timestamptz not null default now()
);
-- Audit rows are append-only: block updates and deletes at the DB level.
create or replace function audit_log_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'audit_log is immutable';
end $$;
drop trigger if exists audit_log_no_update on audit_log;
create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function audit_log_immutable();

-- =============================================================================
-- Verification RPC — the ONLY path that changes verified/pending quantities.
-- Runs transactionally, enforces the invariant, and writes the audit entry.
-- =============================================================================
create or replace function verify_submission(
  p_submission uuid,
  p_kind       text,           -- 'approve' | 'partial' | 'reject' | 'info'
  p_qty        integer default null,
  p_reason     text default null
) returns submissions
language plpgsql security definer set search_path = public as $$
declare
  s submissions;
  n needs;
  actor_name text;
  approved integer;
  before_v integer;
  after_v  integer;
  is_partial boolean;
  now_complete boolean;
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can verify deliveries';
  end if;

  select * into s from submissions where id = p_submission for update;
  if not found then raise exception 'Submission not found'; end if;
  select * into n from needs where id = s.need_id for update;

  select coalesce(full_name,'Coordinator') into actor_name from profiles where id = auth.uid();

  if p_kind = 'reject' then
    update submissions set status='Rejected', verified_qty=0,
      note=coalesce(p_reason,'Could not be verified at the drop-off point.')
      where id = s.id returning * into s;
    update needs set pending_qty = greatest(0, pending_qty - s.qty), updated_at=now()
      where id = n.id;
    insert into audit_log(disaster_id, actor, action, detail, old_value, new_value, color)
      values (n.disaster_id, actor_name, 'Delivery rejected',
        n.name||' · '||s.code||' · '||s.qty||' '||s.unit,
        'Pending verification','Rejected','#D9363E');
    return s;
  end if;

  if p_kind = 'info' then
    update submissions set status='Information requested',
      note=coalesce(p_reason,'Coordinator asked for a photo of the delivery.')
      where id = s.id returning * into s;
    insert into audit_log(disaster_id, actor, action, detail, old_value, new_value, color)
      values (n.disaster_id, actor_name, 'Information requested',
        n.name||' · '||s.code,'Pending verification','Information requested','#E6A700');
    return s;
  end if;

  -- approve / partial
  approved := greatest(0, least(coalesce(p_qty, s.qty), s.qty));
  before_v := n.verified_qty;
  after_v  := least(n.required_qty, before_v + approved);
  is_partial := approved < s.qty;
  now_complete := (n.required_qty - after_v) <= 0;

  update submissions set
    status = case when is_partial then 'Partially verified' else 'Verified' end,
    verified_qty = approved,
    note = coalesce(p_reason,
      case when is_partial then (s.qty - approved)||' items could not be verified.'
           else 'Counted and accepted at intake.' end)
    where id = s.id returning * into s;

  update needs set
    verified_qty = after_v,
    pending_qty  = greatest(0, pending_qty - s.qty),
    priority     = case when now_complete then 'Completed'::need_priority else priority end,
    updated_at   = now()
    where id = n.id;

  insert into audit_log(disaster_id, actor, action, detail, old_value, new_value, color)
    values (n.disaster_id, actor_name,
      case when is_partial then 'Delivery partially verified' else 'Delivery verified' end,
      n.name||' · '||s.code||' · '||approved||' of '||s.qty||' '||s.unit,
      before_v||' verified', after_v||' verified',
      case when is_partial then '#F97316' else '#159947' end);

  if now_complete then
    insert into audit_log(disaster_id, actor, action, detail, old_value, new_value, color)
      values (n.disaster_id, actor_name, 'Need completed',
        n.name||' reached its required amount','Active','Completed','#159947');
  end if;

  return s;
end $$;

-- =============================================================================
-- Row-Level Security
-- =============================================================================
alter table profiles       enable row level security;
alter table disasters      enable row level security;
alter table locations      enable row level security;
alter table needs          enable row level security;
alter table submissions    enable row level security;
alter table need_requests  enable row level security;
alter table announcements  enable row level security;
alter table audit_log      enable row level security;

-- Public (anon + authenticated) may READ the operational picture.
create policy disasters_read     on disasters     for select using (true);
create policy locations_read     on locations     for select using (true);
create policy needs_read         on needs         for select using (true);
create policy announcements_read on announcements for select using (true);
-- The audit log is public-transparent (it holds no contributor PII).
create policy audit_read         on audit_log     for select using (true);

-- Submissions contain contributor PII: the public may NOT list them.
-- Anyone may CREATE a delivery report (no account required).
create policy submissions_insert on submissions for insert with check (true);
-- Only coordinators may list/read submissions in full.
create policy submissions_coord_read on submissions for select using (is_coordinator());
-- Public single-submission tracking is served by track_submission() (below),
-- which is SECURITY DEFINER and returns non-PII fields for a matching code+email.

-- Need requests: anyone may submit; only coordinators read them.
create policy need_requests_insert on need_requests for insert with check (true);
create policy need_requests_coord_read on need_requests for select using (is_coordinator());

-- Coordinator write access to needs (create / manage). Verified/pending changes
-- should go through verify_submission(), but coordinators may create & edit needs.
create policy needs_coord_write on needs for all
  using (is_coordinator()) with check (is_coordinator());
create policy locations_coord_write on locations for all
  using (is_coordinator()) with check (is_coordinator());
create policy announcements_coord_write on announcements for all
  using (is_coordinator()) with check (is_coordinator());

-- Profiles: a user can read/update only their own profile.
create policy profiles_self_read   on profiles for select using (id = auth.uid());
create policy profiles_self_update on profiles for update using (id = auth.uid());

-- ---------- Public tracking RPC (privacy-safe) ------------------------------
create or replace function track_submission(p_code text, p_email text)
returns table (
  code text, qty integer, unit text, need_name text, location_name text,
  submitted_at timestamptz, status submission_status, verified_qty integer, note text, photo_url text
) language sql security definer set search_path = public as $$
  select s.code, s.qty, s.unit, n.name, s.location_name,
         s.submitted_at, s.status, s.verified_qty, s.note, s.photo_url
  from submissions s join needs n on n.id = s.need_id
  where upper(s.code) = upper(trim(p_code))
    and lower(s.contributor_email) = lower(trim(p_email));
$$;

-- ---------- New-profile trigger ---------------------------------------------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- =============================================================================
-- Hardening: least privilege on SECURITY DEFINER functions
-- =============================================================================
-- handle_new_user is a trigger only — never a public RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
-- verify_submission is coordinator-only (also guarded internally by is_coordinator()).
revoke execute on function public.verify_submission(uuid, text, integer, text) from public, anon;
grant  execute on function public.verify_submission(uuid, text, integer, text) to authenticated;
-- track_submission stays callable by anon/authenticated by design (public code+email
-- lookup that returns non-PII fields); is_coordinator stays callable because RLS
-- policies invoke it and it returns false for anon.
