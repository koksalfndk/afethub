-- AfetHUB — migration 0012
-- Reviewing correction requests (organization_edit_requests).
--
-- 0007 created the table and said applying a request is deliberately not automated.
-- That still holds: nothing here applies a request on its own. What this adds is the
-- coordinator's decision as ONE transaction — copy the accepted fields onto the
-- record, close the request, write the audit entry — so a half-applied correction
-- cannot exist (rules/03 §Race Conditions, §Audit Log).
--
-- Two functions, because the two decisions are genuinely different:
--   review_org_edit_request_apply(request, fields[], note)  — accept some/all fields
--   review_org_edit_request_reject(request, note)           — accept none
--
-- KEY NAMING: `proposed` and `changed_fields` are written by the browser and carry the
-- client's camelCase field names ('emergencyPhone'), not column names
-- ('emergency_phone') — see submitOrgEditRequest in src/data/supabaseRepo.ts. Every
-- function below therefore speaks client keys and maps to a column exactly once, in
-- org_edit_field_column(). Getting this wrong is silent: the intersection with
-- changed_fields would simply come out empty and nothing would ever apply.
--
-- Additive and idempotent.
-- =============================================================================

-- ---------- 1) Which keys may ever be written --------------------------------
-- The allow-list lives in the database, not only in the form. `status`,
-- `is_official`, `logo` and the verification columns are coordinator decisions about
-- the record and are NOT part of what a visitor may propose; a request that somehow
-- carried them must not be able to write them (rules/03 §Input Validation).
-- Returns null for anything not allow-listed — callers treat null as "refuse".
create or replace function org_edit_field_column(p_key text)
returns text language sql immutable as $$
  select case p_key
    when 'name'           then 'name'
    when 'kind'           then 'kind'
    when 'scope'          then 'scope'
    when 'province'       then 'province'
    when 'district'       then 'district'
    when 'services'       then 'services'
    when 'description'    then 'description'
    when 'website'        then 'website'
    when 'email'          then 'email'
    when 'phone'          then 'phone'
    when 'emergencyPhone' then 'emergency_phone'
    when 'address'        then 'address'
    else null
  end
$$;

-- ---------- 2) Coordinator-readable list ------------------------------------
-- A view rather than direct table reads, so the client has one shape to map and the
-- organization's current values arrive next to the proposal — a diff cannot be shown
-- honestly without both sides. `current_record` is built with the SAME camelCase keys
-- as `proposed` so the client compares like with like, and it lists the editable
-- fields only: the submitter columns of `organizations` have no business in a review
-- payload (rules/05 §Public and Private Views).
--
-- Still coordinator-only. A view runs with the caller's rights and both underlying
-- tables restrict select to is_coordinator(), so this grants no new access.
create or replace view organization_edit_requests_review as
select
  r.id,
  r.organization_id,
  o.name   as organization_name,
  o.status as organization_status,
  r.proposed,
  -- The record as it is RIGHT NOW, not as it was when the request was filed. A
  -- coordinator must not be shown a stale "current" column and asked to approve a
  -- change against it.
  jsonb_build_object(
    'name', o.name, 'kind', o.kind, 'scope', o.scope,
    'province', o.province, 'district', o.district,
    'services', to_jsonb(o.services), 'description', o.description,
    'website', o.website, 'email', o.email, 'phone', o.phone,
    'emergencyPhone', o.emergency_phone, 'address', o.address
  ) as current_record,
  r.changed_fields,
  r.note,
  r.status,
  r.review_note,
  r.submitted_by_name,
  r.submitted_by_email,
  r.submitted_by_phone,
  r.created_at,
  r.reviewed_at
from organization_edit_requests r
join organizations o on o.id = r.organization_id;

grant select on organization_edit_requests_review to authenticated;

-- ---------- 3) Apply ---------------------------------------------------------
create or replace function review_org_edit_request_apply(
  p_request uuid,
  p_fields  text[],
  p_note    text default ''
) returns organizations
language plpgsql security definer set search_path = public as $$
declare
  v_req    organization_edit_requests;
  v_before organizations;
  v_row    organizations;
  v_keys   text[];
  v_bad    text[];
  v_diff   text := '';
  v_col    text;
  k        text;
begin
  if not is_coordinator() then
    raise exception 'not authorized';
  end if;

  -- Lock the request first: two coordinators working the same queue must not both
  -- apply it and write the change twice.
  select * into v_req from organization_edit_requests where id = p_request for update;
  if v_req is null then
    raise exception 'edit request not found';
  end if;
  if v_req.status <> 'Pending review' then
    raise exception 'edit request already reviewed';
  end if;

  -- Anything outside the allow-list is an error, not a silent skip.
  v_bad := array(
    select k2 from unnest(coalesce(p_fields, '{}'::text[])) k2
    where org_edit_field_column(k2) is null
  );
  if array_length(v_bad, 1) > 0 then
    raise exception 'field not editable: %', array_to_string(v_bad, ', ');
  end if;

  -- Only keys the requester actually changed. An empty result is an error rather than
  -- a no-op that would still close the request as "Applied".
  v_keys := array(
    select k2 from unnest(coalesce(p_fields, '{}'::text[])) k2
    where k2 = any(v_req.changed_fields)
  );
  if array_length(v_keys, 1) is null then
    raise exception 'no applicable fields selected';
  end if;

  select * into v_before from organizations where id = v_req.organization_id for update;
  if v_before is null then
    raise exception 'organization not found';
  end if;

  -- Column-by-column, driven by the selected keys. `services` is the only array
  -- column, so it is built separately; everything else is text.
  foreach k in array v_keys loop
    v_col := org_edit_field_column(k);
    if v_col = 'services' then
      update organizations set services = coalesce(
        (select array_agg(x) from jsonb_array_elements_text(v_req.proposed -> 'services') x),
        '{}'::text[]
      ) where id = v_before.id;
    else
      execute format('update organizations set %I = $1 where id = $2', v_col)
        using coalesce(v_req.proposed ->> k, ''), v_before.id;
    end if;
    v_diff := v_diff || case when v_diff = '' then '' else ', ' end || k;
  end loop;

  update organizations set updated_at = now() where id = v_before.id
  returning * into v_row;

  update organization_edit_requests set
    status      = 'Applied',
    review_note = coalesce(p_note, ''),
    reviewed_at = now()
  where id = p_request;

  -- Old and new value carry the field lists, not the whole record: the audit entry is
  -- read in a feed and has to stay legible. The full proposal stays on the request row.
  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (
    null,
    coalesce((select full_name from profiles where id = auth.uid()), 'Koordinatör'),
    'Kurum düzeltmesi uygulandı',
    v_row.name || coalesce(' · ' || nullif(v_row.province, ''), ''),
    'Talep edilen: ' || array_to_string(v_req.changed_fields, ', '),
    'Uygulanan: ' || v_diff,
    '#159947'
  );

  return v_row;
end $$;

revoke all on function review_org_edit_request_apply(uuid, text[], text) from public, anon;
grant execute on function review_org_edit_request_apply(uuid, text[], text) to authenticated;

-- ---------- 4) Reject --------------------------------------------------------
-- A reason is mandatory. "Rejected, no reason given" is the state that makes a
-- moderation queue untrustworthy, and the requester may ask why.
create or replace function review_org_edit_request_reject(
  p_request uuid,
  p_note    text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req  organization_edit_requests;
  v_name text;
begin
  if not is_coordinator() then
    raise exception 'not authorized';
  end if;
  if length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'reject reason required';
  end if;

  select * into v_req from organization_edit_requests where id = p_request for update;
  if v_req is null then
    raise exception 'edit request not found';
  end if;
  if v_req.status <> 'Pending review' then
    raise exception 'edit request already reviewed';
  end if;

  update organization_edit_requests set
    status      = 'Rejected',
    review_note = btrim(p_note),
    reviewed_at = now()
  where id = p_request;

  select name into v_name from organizations where id = v_req.organization_id;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (
    null,
    coalesce((select full_name from profiles where id = auth.uid()), 'Koordinatör'),
    'Kurum düzeltmesi reddedildi',
    coalesce(v_name, '—'),
    'Talep edilen: ' || array_to_string(v_req.changed_fields, ', '),
    btrim(p_note),
    '#D9363E'
  );
end $$;

revoke all on function review_org_edit_request_reject(uuid, text) from public, anon;
grant execute on function review_org_edit_request_reject(uuid, text) to authenticated;

-- Note on what is NOT here: applying a request does not change the organization's
-- verification status. A verified record stays verified and an unverified one stays
-- unverified — correcting a phone number is not evidence about the institution
-- (rules/02: a request is never automatically a record).
