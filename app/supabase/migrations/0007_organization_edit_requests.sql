-- AfetHUB — migration 0007
-- Correction requests against a published organization record.
--
-- The public directory page pre-fills a form with the record's current values and a
-- contributor edits the fields they believe are wrong. What is stored here is a
-- PROPOSAL: the `organizations` row is never touched by this table. A coordinator
-- reviews it and applies it, which is the only reason the "Doğrulandı" badge means
-- anything (rules/02 — a request is never automatically a record).
--
-- Additive and idempotent.
-- =============================================================================

do $$ begin
  create type edit_request_status as enum ('Pending review','Applied','Rejected');
exception when duplicate_object then null; end $$;

create table if not exists organization_edit_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  -- The full proposed record as the contributor left it. Stored whole rather than as
  -- a column-per-field so the coordinator sees exactly what was submitted, even if
  -- the live record changes in the meantime.
  proposed        jsonb not null,
  -- Which keys differ from the record at submission time. Computed by
  -- changedOrgFields() in src/data/repo.ts; keep the two in step.
  changed_fields  text[] not null default '{}',
  -- Required: a diff alone does not tell a coordinator whether to trust it.
  note            text not null check (length(btrim(note)) between 10 and 1200),
  status          edit_request_status not null default 'Pending review',
  review_note     text not null default '',
  -- Requester contact. Operational data — coordinator-only, exactly like the
  -- submitter columns on `organizations` (rules/03 §Contact Information).
  submitted_by_name  text not null default '',
  submitted_by_email text not null default '',
  submitted_by_phone text not null default '',
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz,
  constraint proposed_is_object check (jsonb_typeof(proposed) = 'object')
);

create index if not exists org_edit_requests_open_idx
  on organization_edit_requests (status, created_at desc);
create index if not exists org_edit_requests_org_idx
  on organization_edit_requests (organization_id, created_at desc);

alter table organization_edit_requests enable row level security;

-- Anyone may file a correction request, with or without an account: the directory is
-- public and so is the ability to say a public record is wrong (CLAUDE.md §Primary
-- Product Rule). Status/review fields are not client-settable — the WITH CHECK below
-- pins them to their defaults.
drop policy if exists org_edit_requests_public_insert on organization_edit_requests;
create policy org_edit_requests_public_insert on organization_edit_requests
  for insert to anon, authenticated
  with check (
    status = 'Pending review'
    and btrim(review_note) = ''
    and reviewed_at is null
  );

-- Reads and decisions are coordinator-only: each row carries the requester's contact
-- details and an unreviewed claim about an institution.
drop policy if exists org_edit_requests_coord_read on organization_edit_requests;
create policy org_edit_requests_coord_read on organization_edit_requests
  for select using (is_coordinator());

drop policy if exists org_edit_requests_coord_write on organization_edit_requests;
create policy org_edit_requests_coord_write on organization_edit_requests
  for update using (is_coordinator()) with check (is_coordinator());

grant insert on organization_edit_requests to anon, authenticated;
grant select, update on organization_edit_requests to authenticated;

-- Abuse note: this endpoint is callable without an account, so it needs rate limiting
-- and bot protection at the edge (rules/03 §Abuse Prevention). Not implemented here.
--
-- Applying a request is deliberately NOT automated. A coordinator copies the accepted
-- fields onto the record, which produces the usual audit entry; auto-applying would
-- let anyone rewrite a verified institution's phone number.
