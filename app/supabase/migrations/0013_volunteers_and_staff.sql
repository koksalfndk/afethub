-- AfetHUB — migration 0013
-- Volunteer applications, and granting the coordinator/admin roles.
--
-- Two features, one migration, because both hang off the same missing piece: there was
-- no way to become anything other than a volunteer, and no way to apply as one.
--
-- Additive and idempotent.
-- =============================================================================

-- ---------- 0) is_admin() ----------------------------------------------------
-- Role management is admin-only, not coordinator-only. A coordinator running an
-- operation has no business promoting people (rules/03 §Server-Side Authorization:
-- protect user role management).
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin');
$$;
revoke all on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;

-- =============================================================================
-- 1) Volunteer applications
-- =============================================================================
do $$ begin
  create type volunteer_status as enum
    ('Pending review','Approved','On hold','Rejected','Withdrawn');
exception when duplicate_object then null; end $$;

create table if not exists volunteer_applications (
  id           uuid primary key default gen_random_uuid(),
  -- Null = general volunteer pool. A coordinator can route a pooled applicant to an
  -- operation later; forcing a disaster here would mean no applications between events.
  disaster_id  uuid references disasters(id) on delete set null,
  full_name    text not null check (length(btrim(full_name)) between 2 and 120),
  phone        text not null default '',
  email        text not null default '',
  province     text not null default '',
  district     text not null default '',
  -- What they can actually do. Free-form list from a fixed client-side set; kept as an
  -- array rather than one text field so a coordinator can filter on it.
  skills       text[] not null default '{}',
  availability text not null default '',
  -- Their own words. Bounded: a public endpoint must not accept unbounded text.
  note         text not null default '' check (length(note) <= 1200),
  -- Consent is recorded, not assumed: the row carries a phone number and an address
  -- level down to district, and it is kept so a coordinator can call them.
  consent      boolean not null default false check (consent = true),
  status       volunteer_status not null default 'Pending review',
  review_note  text not null default '',
  reviewed_by  uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  -- At least one way to reach them, or the application is unusable.
  constraint volunteer_has_contact check (btrim(phone) <> '' or btrim(email) <> '')
);

create index if not exists volunteer_apps_open_idx
  on volunteer_applications (status, created_at desc);
create index if not exists volunteer_apps_disaster_idx
  on volunteer_applications (disaster_id, created_at desc);

alter table volunteer_applications enable row level security;

-- Anyone may apply, with or without an account (CLAUDE.md §Primary Product Rule).
-- Review fields are pinned to their defaults by the WITH CHECK so a client cannot
-- submit itself as already approved.
drop policy if exists volunteer_apps_public_insert on volunteer_applications;
create policy volunteer_apps_public_insert on volunteer_applications
  for insert to anon, authenticated
  with check (
    status = 'Pending review'
    and btrim(review_note) = ''
    and reviewed_by is null
    and reviewed_at is null
    and consent = true
  );

-- There is deliberately NO public select policy. Every row is a named person with a
-- phone number; nothing about a volunteer application is public
-- (rules/01 §Public Access, rules/05 §Public and Private Views).
drop policy if exists volunteer_apps_coord_read on volunteer_applications;
create policy volunteer_apps_coord_read on volunteer_applications
  for select using (is_coordinator());

drop policy if exists volunteer_apps_coord_write on volunteer_applications;
create policy volunteer_apps_coord_write on volunteer_applications
  for update using (is_coordinator()) with check (is_coordinator());

grant insert on volunteer_applications to anon, authenticated;
grant select, update on volunteer_applications to authenticated;

-- Deciding on an application: one transaction, with the audit entry.
create or replace function review_volunteer_application(
  p_app    uuid,
  p_status volunteer_status,
  p_note   text default ''
) returns volunteer_applications
language plpgsql security definer set search_path = public as $$
declare
  v_before volunteer_status;
  v_row    volunteer_applications;
begin
  if not is_coordinator() then
    raise exception 'not authorized';
  end if;
  if p_status = 'Pending review' then
    raise exception 'cannot move an application back to pending';
  end if;
  if p_status in ('Rejected','On hold') and length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'reason required';
  end if;

  select status into v_before from volunteer_applications where id = p_app for update;
  if v_before is null then
    raise exception 'application not found';
  end if;
  if v_before <> 'Pending review' and v_before <> 'On hold' then
    raise exception 'application already decided';
  end if;

  update volunteer_applications set
    status = p_status, review_note = coalesce(p_note, ''),
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_app
  returning * into v_row;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (
    v_row.disaster_id,
    coalesce((select full_name from profiles where id = auth.uid()), 'Koordinatör'),
    'Gönüllü başvurusu değerlendirildi',
    v_row.full_name || coalesce(' · ' || nullif(v_row.province, ''), ''),
    v_before::text, p_status::text,
    case p_status when 'Approved' then '#159947' when 'Rejected' then '#D9363E' else '#E6A700' end
  );

  return v_row;
end $$;

revoke all on function review_volunteer_application(uuid, volunteer_status, text) from public, anon;
grant execute on function review_volunteer_application(uuid, volunteer_status, text) to authenticated;

-- Note: an approved application does NOT create an account and does not change the
-- `volunteers` counter on a disaster. That counter is who is registered on site; an
-- approved form is a person a coordinator has agreed to call. Conflating the two would
-- inflate a public figure with unverified sign-ups (rules/01 §Freshness, rules/08).

-- =============================================================================
-- 2) Granting coordinator / admin
-- =============================================================================
-- The browser cannot create auth users — that needs the service-role key, which must
-- never reach the client (rules/03 §Secrets). So the flow is invite-then-claim:
--   * the person already has an account -> their role is changed immediately
--   * they do not -> the grant is stored and applied when they sign up with that e-mail
--
-- An invite is NOT access: it does nothing until someone proves control of the address
-- by completing Supabase's own sign-up and e-mail verification.
create table if not exists role_invites (
  email       text primary key check (position('@' in email) > 1),
  role        text not null check (role in ('coordinator','admin')),
  invited_by  uuid references profiles(id) on delete set null,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references profiles(id) on delete set null
);

alter table role_invites enable row level security;

-- Admin-only in every direction. A coordinator must not be able to read the list of
-- pending invites, let alone add one.
drop policy if exists role_invites_admin_all on role_invites;
create policy role_invites_admin_all on role_invites
  for all using (is_admin()) with check (is_admin());
grant select, insert, update, delete on role_invites to authenticated;

-- Staff directory. A view rather than opening `profiles`: an admin needs the e-mail to
-- manage roles, and `profiles` has no e-mail column — it lives in auth.users, which is
-- not client-readable. SECURITY DEFINER function instead of a view so the join to
-- auth.users is possible without granting anything on that schema.
create or replace function staff_directory()
returns table (id uuid, full_name text, email text, role text, created_at timestamptz)
language sql security definer set search_path = public, auth as $$
  select p.id, p.full_name, u.email::text, p.role, p.created_at
  from profiles p join auth.users u on u.id = p.id
  where is_admin() and p.role in ('coordinator','admin')
  order by p.role, p.full_name;
$$;
revoke all on function staff_directory() from public, anon;
grant execute on function staff_directory() to authenticated;

-- Grant a role by e-mail. Returns 'granted' when an existing account was changed and
-- 'invited' when the grant was stored for a future sign-up.
create or replace function grant_staff_role(p_email text, p_role text, p_note text default '')
returns text language plpgsql security definer set search_path = public, auth as $$
declare
  v_email text := lower(btrim(p_email));
  v_uid   uuid;
  v_name  text;
  v_before text;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  if p_role not in ('coordinator','admin') then
    raise exception 'invalid role';
  end if;
  if position('@' in v_email) < 2 then
    raise exception 'invalid e-mail';
  end if;

  select u.id into v_uid from auth.users u where lower(u.email) = v_email limit 1;

  if v_uid is null then
    insert into role_invites (email, role, invited_by, note)
    values (v_email, p_role, auth.uid(), coalesce(p_note, ''))
    on conflict (email) do update
      set role = excluded.role, invited_by = excluded.invited_by,
          note = excluded.note, created_at = now(),
          accepted_at = null, accepted_by = null;

    insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
    values (null, coalesce((select full_name from profiles where id = auth.uid()), 'Yönetici'),
            'Yetki daveti oluşturuldu', v_email, '—', p_role, '#E6A700');
    return 'invited';
  end if;

  select role, full_name into v_before, v_name from profiles where id = v_uid for update;
  update profiles set role = p_role where id = v_uid;
  delete from role_invites where email = v_email;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (null, coalesce((select full_name from profiles where id = auth.uid()), 'Yönetici'),
          'Kullanıcı yetkisi değişti',
          coalesce(nullif(v_name, ''), v_email), coalesce(v_before, 'volunteer'), p_role, '#2A6FB0');
  return 'granted';
end $$;
revoke all on function grant_staff_role(text, text, text) from public, anon;
grant execute on function grant_staff_role(text, text, text) to authenticated;

-- Take a role away: back to 'volunteer'. Separate function because it has one guard the
-- grant path does not — an admin must not be able to demote themselves and leave the
-- platform with no admin at all.
create or replace function revoke_staff_role(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_before text;
  v_name   text;
  v_admins integer;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  if p_user = auth.uid() then
    raise exception 'cannot change your own role';
  end if;

  select role, full_name into v_before, v_name from profiles where id = p_user for update;
  if v_before is null then
    raise exception 'user not found';
  end if;
  if v_before = 'admin' then
    select count(*) into v_admins from profiles where role = 'admin';
    if v_admins <= 1 then
      raise exception 'last admin cannot be demoted';
    end if;
  end if;

  update profiles set role = 'volunteer' where id = p_user;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (null, coalesce((select full_name from profiles where id = auth.uid()), 'Yönetici'),
          'Kullanıcı yetkisi kaldırıldı', coalesce(nullif(v_name, ''), p_user::text),
          v_before, 'volunteer', '#D9363E');
end $$;
revoke all on function revoke_staff_role(uuid) from public, anon;
grant execute on function revoke_staff_role(uuid) to authenticated;

-- ---------- Claim an invite on sign-up --------------------------------------
-- handle_new_user() already creates the profile row. It is extended (not replaced by a
-- second trigger) so there is exactly one place that decides what a new profile looks
-- like. Matching is on the verified address Supabase itself put in auth.users; the
-- client never supplies it.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text := 'volunteer';
begin
  select ri.role into v_role
  from role_invites ri
  where lower(ri.email) = lower(new.email) and ri.accepted_at is null
  limit 1;

  insert into profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), coalesce(v_role, 'volunteer'))
  on conflict (id) do nothing;

  if v_role is not null then
    update role_invites set accepted_at = now(), accepted_by = new.id
    where lower(email) = lower(new.email);

    insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
    values (null, 'Sistem', 'Yetki daveti kullanıldı', lower(new.email), '—', v_role, '#2A6FB0');
  end if;

  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Note on self-service escalation: `profiles_self_update` (migration 0006) pins `role`
-- and `org_verified`, so a signed-in user still cannot write their own role. Everything
-- above goes through is_admin()-guarded functions.
