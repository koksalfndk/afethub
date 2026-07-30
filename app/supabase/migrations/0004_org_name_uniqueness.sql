-- AfetHUB — migration 0004
-- Organization names are unique on their own, not per province.
--
-- 0002 keyed uniqueness on (name, province). That let the same body be added twice
-- with a different or empty province — which is exactly what happened: the client
-- blocked the duplicate by name, the database did not. Uniqueness now matches what
-- the UI promises: one row per organization name.
--
-- NOT destructive: if duplicates already exist the index creation fails loudly and
-- the surviving/removing decision stays with a human. Run the SELECT first.
-- =============================================================================

-- Inspect before applying:
--   select lower(btrim(name)) as n, count(*) from organizations group by n having count(*) > 1;

drop index if exists organizations_name_province_uniq;

create unique index if not exists organizations_name_uniq
  on organizations (lower(btrim(name)));
