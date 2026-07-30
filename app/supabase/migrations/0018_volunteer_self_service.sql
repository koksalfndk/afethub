-- AfetHUB — migration 0018
-- A volunteer can see, edit and withdraw their own application, and gets one receipt
-- e-mail when they apply.
--
-- The shape of the problem: `volunteer_applications` rows are named people with phone
-- numbers, so 0013 gave the table no public select policy at all. That is still right —
-- what is added here is a narrow, own-rows-only path matched on the signed-in account's
-- own e-mail address, through SECURITY DEFINER functions rather than by loosening the
-- table (rules/05 §Public and Private Views).
--
-- Guests are deliberately NOT covered: without an account there is nothing to match on
-- except an e-mail address anyone could type, and "show me the applications filed with
-- this address" is an information-disclosure endpoint. A guest who wants to manage an
-- application can create an account with the same address (rules/03 §Data Minimization).
--
-- Additive and idempotent.
-- =============================================================================

-- ---------- 1) One receipt per application ------------------------------------
-- Marks that the confirmation e-mail has been handed to the provider. It is also the
-- abuse bound on the public receipt endpoint below: an application can trigger at most
-- one mail, ever.
alter table volunteer_applications
  add column if not exists receipt_sent_at timestamptz;

comment on column volunteer_applications.receipt_sent_at is
  'Set when the application receipt e-mail was handed to the provider. Single-use guard.';

-- ---------- 2) The caller's own applications ----------------------------------
-- Matched on the account's e-mail, lowercased on both sides. The phone number and note
-- are the caller's own data, so they come back in full — masking your own record would
-- make the edit form useless.
create or replace function my_volunteer_applications()
returns table (
  id uuid, disaster_id uuid, disaster_name text,
  full_name text, phone text, email text, province text, district text,
  skills text[], availability text, note text,
  status volunteer_status, review_note text,
  on_shift boolean, shift_since timestamptz,
  created_at timestamptz, reviewed_at timestamptz
) language sql stable security definer set search_path = public, auth as $$
  select
    v.id, v.disaster_id, coalesce(d.name, ''),
    v.full_name, v.phone, v.email, v.province, v.district,
    v.skills, v.availability, v.note,
    v.status, v.review_note,
    v.on_shift, v.shift_since,
    v.created_at, v.reviewed_at
  from volunteer_applications v
  left join disasters d on d.id = v.disaster_id
  where auth.uid() is not null
    and lower(btrim(v.email)) = (select lower(btrim(u.email)) from auth.users u where u.id = auth.uid())
  order by v.created_at desc;
$$;
revoke all on function my_volunteer_applications() from public, anon;
grant execute on function my_volunteer_applications() to authenticated;

-- ---------- 3) Editing your own application -----------------------------------
-- What a volunteer may change: where they are, what they can do, when, and the note.
-- What they may NOT change: the e-mail the row is matched on (that would move the row
-- to someone else), and any review field.
--
-- Editing an application a coordinator already approved sends it back to review. The
-- approval was a decision about a specific set of skills, availability and location; if
-- those change, the decision has not been made about the new version. The client says
-- so before saving (rules/02 §Status Transitions — no silent transitions).
create or replace function update_my_volunteer_application(
  p_app          uuid,
  p_disaster     uuid,
  p_full_name    text,
  p_phone        text,
  p_province     text,
  p_district     text,
  p_skills       text[],
  p_availability text,
  p_note         text
) returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_mine   boolean;
  v_before volunteer_status;
  v_name   text;
  v_did    uuid;
begin
  select true, v.status, v.full_name, v.disaster_id into v_mine, v_before, v_name, v_did
  from volunteer_applications v
  where v.id = p_app
    and auth.uid() is not null
    and lower(btrim(v.email)) = (select lower(btrim(u.email)) from auth.users u where u.id = auth.uid())
  for update;
  if v_mine is not true then
    raise exception 'not authorized';
  end if;
  if v_before in ('Rejected','Withdrawn') then
    raise exception 'application closed';
  end if;
  if length(btrim(p_full_name)) < 2 then
    raise exception 'name required';
  end if;
  if coalesce(array_length(p_skills, 1), 0) = 0 then
    raise exception 'at least one skill required';
  end if;

  update volunteer_applications set
    disaster_id  = p_disaster,
    full_name    = btrim(p_full_name),
    phone        = btrim(coalesce(p_phone, '')),
    province     = btrim(coalesce(p_province, '')),
    district     = btrim(coalesce(p_district, '')),
    skills       = p_skills,
    availability = coalesce(p_availability, ''),
    note         = btrim(coalesce(p_note, '')),
    -- Back to the queue when the approved version is edited. review_note is cleared so
    -- a note about the old version cannot be read as a note about the new one.
    status       = case when v_before = 'Approved' then 'Pending review'::volunteer_status else v_before end,
    review_note  = case when v_before = 'Approved' then '' else review_note end,
    reviewed_by  = case when v_before = 'Approved' then null else reviewed_by end,
    reviewed_at  = case when v_before = 'Approved' then null else reviewed_at end,
    -- An edited application is no longer the one that was put on shift.
    on_shift     = case when v_before = 'Approved' then false else on_shift end,
    shift_since  = case when v_before = 'Approved' then null else shift_since end
  where id = p_app;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (v_did, coalesce(nullif(btrim(p_full_name), ''), 'Gönüllü'),
          'Gönüllü başvurusu güncellendi', v_name,
          v_before::text,
          case when v_before = 'Approved' then 'Pending review · yeniden inceleme' else v_before::text end,
          '#2A6FB0');
end $$;
revoke all on function update_my_volunteer_application(uuid, uuid, text, text, text, text, text[], text, text)
  from public, anon;
grant execute on function update_my_volunteer_application(uuid, uuid, text, text, text, text, text[], text, text)
  to authenticated;

-- ---------- 4) Withdrawing ------------------------------------------------------
-- Soft: the row stays, the status becomes 'Withdrawn' (rules/05 §Soft Deletion). A
-- withdrawn application stops counting towards an operation's volunteer figure, which
-- is why the shift flag is cleared with it.
create or replace function withdraw_my_volunteer_application(p_app uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_mine boolean; v_before volunteer_status; v_name text; v_did uuid;
begin
  select true, v.status, v.full_name, v.disaster_id into v_mine, v_before, v_name, v_did
  from volunteer_applications v
  where v.id = p_app
    and auth.uid() is not null
    and lower(btrim(v.email)) = (select lower(btrim(u.email)) from auth.users u where u.id = auth.uid())
  for update;
  if v_mine is not true then
    raise exception 'not authorized';
  end if;
  if v_before = 'Withdrawn' then
    return;
  end if;

  update volunteer_applications
     set status = 'Withdrawn', on_shift = false, shift_since = null
   where id = p_app;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (v_did, coalesce(nullif(v_name, ''), 'Gönüllü'), 'Gönüllü başvurusu geri çekildi',
          v_name, v_before::text, 'Withdrawn', '#8095A8');
end $$;
revoke all on function withdraw_my_volunteer_application(uuid) from public, anon;
grant execute on function withdraw_my_volunteer_application(uuid) to authenticated;

-- ---------- 5) What the receipt e-mail is allowed to read -----------------------
-- Callable without an account, because the form itself is (CLAUDE.md §Primary Product
-- Rule). Three things keep it from being a mailer for anyone who asks:
--   * it takes an id nobody can guess (a v4 uuid) and returns nothing else;
--   * it only answers for an application created in the last 15 minutes;
--   * it marks receipt_sent_at on the way out, so one application yields one e-mail.
-- The address is read from the row — it is never passed in — so this cannot be pointed
-- at a third party.
create or replace function volunteer_receipt_context(p_app uuid)
returns table (
  email text, full_name text, disaster_name text,
  province text, district text, skills text[], availability text, note text,
  phone text, created_at timestamptz
) language plpgsql security definer set search_path = public as $$
begin
  return query
  update volunteer_applications v
     set receipt_sent_at = now()
   where v.id = p_app
     and v.receipt_sent_at is null
     and v.created_at > now() - interval '15 minutes'
     and btrim(v.email) <> ''
  returning
    v.email, v.full_name,
    coalesce((select d.name from disasters d where d.id = v.disaster_id), ''),
    v.province, v.district, v.skills, v.availability, v.note, v.phone, v.created_at;
end $$;
revoke all on function volunteer_receipt_context(uuid) from public;
grant execute on function volunteer_receipt_context(uuid) to anon, authenticated;

-- ---------- Deployment note ------------------------------------------------------
--   supabase functions deploy send-volunteer-receipt --no-verify-jwt
-- The function needs no service-role key: volunteer_receipt_context() above is the only
-- thing it reads, and that function is what enforces the single-use window. RESEND_API_KEY,
-- RESEND_FROM and APP_ORIGIN are the same secrets send-staff-invite already uses.
--
-- Not implemented here, and worth doing before a real event: rate limiting at the edge.
-- The guard above bounds mail-per-application at one, but not requests per IP
-- (rules/03 §Abuse Prevention).
