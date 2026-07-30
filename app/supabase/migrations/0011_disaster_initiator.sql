-- AfetHUB — migration 0011
-- Who opened an operation, and coordinator write access to `disasters`.
--
-- Two things ship together here because the first is meaningless without the second:
-- the panel screen (/koordinasyon/afetler) writes `disasters`, and until now that table
-- only had a public read policy — every insert/update was rejected by RLS.
--
-- Additive and idempotent. No operational data is dropped or rewritten.
-- =============================================================================

-- ---------- 1) disasters.opened_by_org_id -----------------------------------
-- A foreign key, never free text. "X started this operation" is a claim of
-- affiliation on a public page, so it may only point at a record in our own
-- directory; the client additionally refuses to print the line for an
-- organization that is not Verified (rules/03 §Legal and Safety Disclaimer).
--
-- on delete set null: removing an organization must not delete an operation.
alter table disasters
  add column if not exists opened_by_org_id uuid
    references organizations (id) on delete set null;

comment on column disasters.opened_by_org_id is
  'Organization that started the operation; null = AfetHUB''s own coordination team.';

create index if not exists disasters_opened_by_org_idx
  on disasters (opened_by_org_id) where opened_by_org_id is not null;

-- ---------- 2) Coordinator write access -------------------------------------
-- `disasters` already has a read-everything policy for the public dashboard. Writes
-- were never granted, so authorization for the new panel screen is added here rather
-- than assumed from the screen being hard to reach (rules/03 §Server-Side
-- Authorization: hiding a button is not authorization).
--
-- Separate insert/update policies, and deliberately no delete policy: an operation is
-- archived via `status`, never hard-deleted, because its needs, submissions and audit
-- entries must stay auditable (rules/05 §Soft Deletion).
alter table disasters enable row level security;

drop policy if exists disasters_coord_insert on disasters;
create policy disasters_coord_insert on disasters
  for insert with check (is_coordinator());

drop policy if exists disasters_coord_update on disasters;
create policy disasters_coord_update on disasters
  for update using (is_coordinator()) with check (is_coordinator());

-- ---------- 3) Guard rails on the record itself -----------------------------
-- A published operation with an empty name or slug would break every URL that points
-- at it, so the constraint lives in the database and not only in the form.
do $$ begin
  alter table disasters
    add constraint disasters_name_not_blank check (btrim(name) <> '');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table disasters
    add constraint disasters_slug_not_blank check (btrim(slug) <> '');
exception when duplicate_object then null; end $$;

-- Volunteer counters are counts, not signed figures.
do $$ begin
  alter table disasters
    add constraint disasters_counts_non_negative
      check (volunteers >= 0 and on_shift >= 0 and on_shift <= volunteers);
exception when duplicate_object then null; end $$;

-- ---------- 4) Keep the dashboard view in step -------------------------------
-- `disaster_overview` feeds the same client-side mapper as the `disasters` table. A
-- column that exists on the table but not on the view does not error — it silently maps
-- to null, so an operation would lose its initiator depending on which query loaded it.
-- Appended at the end because `create or replace view` may only add trailing columns.
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
  d.opened_by_org_id
from disasters d;

grant select on disaster_overview to anon, authenticated;

-- Note: a coordinator-created operation is published immediately — the coordinator IS
-- the reviewer, so there is nothing to queue it for. That is the same reasoning as a
-- coordinator-filed need request, and it is why no pending state is added here. What is
-- NOT relaxed: the operation still carries `is_demo` and the UI still labels sample
-- content (rules/07 §Seed Content).
