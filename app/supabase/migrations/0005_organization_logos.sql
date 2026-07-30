-- AfetHUB — migration 0005
-- Organization logo, coordinator-set only.
--
-- Why the column is restricted to a local path: rendering an arbitrary remote image
-- supplied by a visitor would let a submission impersonate an institution and would
-- leak every visitor's IP to a third-party host (rules/03 §File Uploads, rules/01
-- §Public Access). Logos are therefore assets committed to app/public/logos/ and the
-- column stores only that path. RLS already forbids anon inserts from setting any
-- column other than the submitted fields; the check constraint makes the shape
-- explicit so a coordinator cannot paste an external URL either.
--
-- Additive and idempotent.
-- =============================================================================

alter table organizations
  add column if not exists logo text not null default '';

do $$ begin
  alter table organizations
    add constraint organizations_logo_local
    check (logo = '' or logo ~ '^/logos/[A-Za-z0-9._-]+\.(webp|png|svg)$');
exception when duplicate_object then null; end $$;

-- Re-declare the public view so the new column is readable by anon. The column list
-- is repeated verbatim from migration 0002 plus `logo`; the submitter columns stay
-- excluded, which is the whole point of the view.
--
-- The view has to be dropped rather than replaced: `create or replace view` cannot
-- insert a column in the middle of an existing column list.
drop view if exists organizations_public;
create view organizations_public as
select
  o.id, o.name, o.kind, o.scope, o.province, o.district, o.services, o.description,
  o.website, o.email, o.phone, o.emergency_phone, o.address, o.status, o.is_official,
  o.logo, o.verified_at, o.created_at
from organizations o
where o.status <> 'Rejected';

grant select on organizations_public to anon, authenticated;

-- Attach the logos that ship with the app to the seeded official records. Matched on
-- the name so re-running is safe and so a renamed row is simply not touched.
update organizations set logo = '/logos/afad.webp'    where logo = '' and name like 'AFAD%';
update organizations set logo = '/logos/kizilay.webp' where logo = '' and name like '%Kızılay%';
update organizations set logo = '/logos/umke.webp'    where logo = '' and name like 'UMKE%';
update organizations set logo = '/logos/ogm.webp'     where logo = '' and name = 'Orman Genel Müdürlüğü';
update organizations set logo = '/logos/akom.webp'    where logo = '' and name like 'AKOM%';
update organizations set logo = '/logos/akut.webp'    where logo = '' and name like 'AKUT%';
update organizations set logo = '/logos/tema.webp'    where logo = '' and name like 'TEMA%';
