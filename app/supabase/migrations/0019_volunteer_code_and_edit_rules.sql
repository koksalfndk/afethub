-- AfetHUB — migration 0019
-- Every volunteer application gets a reference number, and an approved one can no
-- longer be edited.
--
-- Why the edit rule changed: 0018 let a volunteer edit an approved application and sent
-- it back to review. In practice that quietly undoes a coordinator's decision — the
-- person sees "Onaylandı" one moment and "inceleme bekliyor" the next, and a coordinator
-- who had already counted on them loses them without being told. Withdrawing stays
-- available; changing the terms of something that was already accepted does not
-- (rules/02 §Status Transitions: no silent reversals).
--
-- The number exists because a person and a coordinator need to be able to say "başvuru
-- GNL-3F9A2C" out loud. It is a reference, NOT a credential: knowing it grants nothing,
-- exactly like the submission tracking codes (rules/02 §Tracking Codes).
--
-- Additive and idempotent.
-- =============================================================================

-- ---------- 1) The reference number --------------------------------------------
alter table volunteer_applications
  add column if not exists code text;

comment on column volunteer_applications.code is
  'Human-readable reference (GNL-XXXXXX). Not a credential: it grants no access.';

-- Readable and non-sequential: a sequential number would leak how many people have
-- applied, and would make one application id guessable from another.
create or replace function gen_volunteer_code()
returns text language plpgsql as $$
declare v text;
begin
  loop
    -- 0/O and 1/I are left out: this gets read over the phone.
    v := 'GNL-' || (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (1 + floor(random() * 32))::int, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from volunteer_applications where code = v);
  end loop;
  return v;
end $$;

create or replace function volunteer_code_default()
returns trigger language plpgsql as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := gen_volunteer_code();
  end if;
  return new;
end $$;

drop trigger if exists volunteer_code_before_insert on volunteer_applications;
create trigger volunteer_code_before_insert before insert on volunteer_applications
  for each row execute function volunteer_code_default();

-- Rows that predate this migration get one too, so no application is left without a
-- reference to quote.
update volunteer_applications set code = gen_volunteer_code()
 where code is null or btrim(code) = '';

create unique index if not exists volunteer_applications_code_key
  on volunteer_applications (code);

-- ---------- 2) An approved application is no longer editable --------------------
-- Same function as 0018 with the Approved branch removed. The screen hides the button,
-- but that is not what enforces it (rules/03 §Server-Side Authorization).
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
  if v_before = 'Approved' then
    raise exception 'an approved application cannot be edited';
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
    note         = btrim(coalesce(p_note, ''))
  where id = p_app;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (v_did, coalesce(nullif(btrim(p_full_name), ''), 'Gönüllü'),
          'Gönüllü başvurusu güncellendi', v_name, v_before::text, v_before::text, '#2A6FB0');
end $$;
revoke all on function update_my_volunteer_application(uuid, uuid, text, text, text, text, text[], text, text)
  from public, anon;
grant execute on function update_my_volunteer_application(uuid, uuid, text, text, text, text, text[], text, text)
  to authenticated;

-- ---------- 3) The number travels with the row ----------------------------------
-- Both functions gain a column, and Postgres will not widen an existing OUT list in
-- place, so they are dropped first. Nothing depends on them but the client.
drop function if exists my_volunteer_applications();
create or replace function my_volunteer_applications()
returns table (
  id uuid, code text, disaster_id uuid, disaster_name text,
  full_name text, phone text, email text, province text, district text,
  skills text[], availability text, note text,
  status volunteer_status, review_note text,
  on_shift boolean, shift_since timestamptz,
  created_at timestamptz, reviewed_at timestamptz
) language sql stable security definer set search_path = public, auth as $$
  select
    v.id, coalesce(v.code, ''), v.disaster_id, coalesce(d.name, ''),
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

-- The receipt e-mail quotes the number, so the person has it in writing.
drop function if exists volunteer_receipt_context(uuid);
create or replace function volunteer_receipt_context(p_app uuid)
returns table (
  email text, full_name text, disaster_name text,
  province text, district text, skills text[], availability text, note text,
  phone text, code text, created_at timestamptz
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
    v.province, v.district, v.skills, v.availability, v.note, v.phone,
    coalesce(v.code, ''), v.created_at;
end $$;
revoke all on function volunteer_receipt_context(uuid) from public;
grant execute on function volunteer_receipt_context(uuid) to anon, authenticated;
