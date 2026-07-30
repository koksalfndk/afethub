-- AfetHUB — migration 0009
-- District on the profile, next to the existing city.
--
-- The account form now asks for il + ilçe (the district select appears once a province
-- is chosen), so the value needs a column of its own rather than being crammed into
-- `city`. Contact detail: operational, coordinator-visible only, never public
-- (rules/01 §Public Access, rules/03 §Contact Information).
--
-- Additive and idempotent.
-- =============================================================================

alter table profiles add column if not exists district text not null default '';

-- The self-service update policy from migration 0006 already covers this column: it
-- allows a user to update their own row while pinning `role` and `org_verified` to their
-- existing values, so no policy change is needed.
