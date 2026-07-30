-- AfetHUB — migration 0015
-- Optional organization assignment on a role grant, and the data the invite e-mail needs.
--
-- Additive and idempotent.
--
-- READ THIS BEFORE RELYING ON INVITES ---------------------------------------
-- An invite is matched on the e-mail address Supabase itself put in auth.users. That
-- makes controlling the mailbox the thing that claims the role — so the project MUST
-- have e-mail confirmation enabled (Authentication → Sign In / Providers → Confirm
-- email). With confirmation off, anyone who knows an invited address could type it at
-- sign-up and take the role. The invite LINK is deliberately not a secret and carries no
-- token; it only pre-fills the address. Do not "fix" this by adding a token to the URL
-- and treating the token as authorization — a link in an inbox is not proof of identity
-- any more than the address is (rules/03 §Server-Side Authorization).
-- =============================================================================

-- ---------- 1) An invite can carry an organization ---------------------------
-- on delete set null: removing an organization must not delete a pending invite; the
-- person still gets the role, just without a membership.
alter table role_invites
  add column if not exists organization_id uuid references organizations(id) on delete set null;

-- ---------- 2) Grant, with an optional membership ----------------------------
-- Assigning a membership here IS the verification: an admin choosing an institution from
-- the verified list is exactly the check that `org_verified` records. That is why a
-- self-declared membership (the account page) still lands unverified — the difference
-- between the two paths is who made the claim.
create or replace function grant_staff_role(
  p_email text,
  p_role  text,
  p_note  text default '',
  p_org   uuid default null
) returns text language plpgsql security definer set search_path = public, auth as $$
declare
  v_email  text := lower(btrim(p_email));
  v_uid    uuid;
  v_name   text;
  v_before text;
  v_org    uuid := p_org;
  v_orgname text;
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

  if v_org is not null then
    -- Only a verified record may be assigned. Marking someone "doğrulanmış üye" of a
    -- record nobody has checked would make the badge on their profile say more than the
    -- organization's own badge does.
    select o.name into v_orgname from organizations o
      where o.id = v_org and o.status = 'Verified';
    if v_orgname is null then
      raise exception 'organization must exist and be verified';
    end if;
  end if;

  select u.id into v_uid from auth.users u where lower(u.email) = v_email limit 1;

  if v_uid is null then
    insert into role_invites (email, role, invited_by, note, organization_id)
    values (v_email, p_role, auth.uid(), coalesce(p_note, ''), v_org)
    on conflict (email) do update
      set role = excluded.role, invited_by = excluded.invited_by,
          note = excluded.note, organization_id = excluded.organization_id,
          created_at = now(), accepted_at = null, accepted_by = null;

    insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
    values (null, coalesce((select full_name from profiles where id = auth.uid()), 'Yönetici'),
            'Yetki daveti oluşturuldu',
            v_email || coalesce(' · ' || v_orgname, ''), '—', p_role, '#E6A700');
    return 'invited';
  end if;

  select role, full_name into v_before, v_name from profiles where id = v_uid for update;
  update profiles set
    role = p_role,
    organization_id = coalesce(v_org, organization_id),
    -- Only flipped when this call actually assigned one; an existing self-declared
    -- membership must not become verified as a side effect of a role change.
    org_verified = case when v_org is not null then true else org_verified end
  where id = v_uid;
  delete from role_invites where email = v_email;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (null, coalesce((select full_name from profiles where id = auth.uid()), 'Yönetici'),
          'Kullanıcı yetkisi değişti',
          coalesce(nullif(v_name, ''), v_email) || coalesce(' · ' || v_orgname, ''),
          coalesce(v_before, 'volunteer'), p_role, '#2A6FB0');
  return 'granted';
end $$;
revoke all on function grant_staff_role(text, text, text, uuid) from public, anon;
grant execute on function grant_staff_role(text, text, text, uuid) to authenticated;

-- The 3-argument version from 0013 is dropped so a stale client cannot silently call an
-- older grant path that ignores the organization.
drop function if exists grant_staff_role(text, text, text);

-- ---------- 3) What the e-mail needs to know --------------------------------
-- Admin-only. The Edge Function that sends the invite calls this with the admin's own
-- token, so it can decide which template to use and render the organization card without
-- ever holding a service-role key. `exists` tells an admin whether an address already has
-- an account — that is account enumeration, which is why it is behind is_admin().
create or replace function staff_invite_context(p_email text, p_org uuid default null)
returns table (
  account_exists boolean,
  full_name text,
  org_name text,
  org_kind text,
  org_province text,
  org_district text,
  org_phone text,
  org_email text,
  org_website text,
  org_logo text
) language sql security definer set search_path = public, auth as $$
  select
    exists (select 1 from auth.users u where lower(u.email) = lower(btrim(p_email))),
    coalesce((select p.full_name from profiles p
              join auth.users u on u.id = p.id
              where lower(u.email) = lower(btrim(p_email)) limit 1), ''),
    coalesce(o.name, ''), coalesce(o.kind, ''), coalesce(o.province, ''),
    coalesce(o.district, ''), coalesce(o.phone, ''), coalesce(o.email, ''),
    coalesce(o.website, ''), coalesce(o.logo, '')
  from (select 1) _
  left join organizations o on o.id = p_org and o.status = 'Verified'
  where is_admin();
$$;
revoke all on function staff_invite_context(text, uuid) from public, anon;
grant execute on function staff_invite_context(text, uuid) to authenticated;

-- ---------- 4) Claim the invite, membership included ------------------------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_org  uuid;
begin
  select ri.role, ri.organization_id into v_role, v_org
  from role_invites ri
  where lower(ri.email) = lower(new.email) and ri.accepted_at is null
  limit 1;

  insert into profiles (id, full_name, role, organization_id, org_verified)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    coalesce(v_role, 'volunteer'),
    v_org,
    v_org is not null
  )
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

-- ---------- Deployment notes for send-staff-invite --------------------------
--   supabase functions deploy send-staff-invite        (verify_jwt = true)
--   supabase secrets set RESEND_API_KEY=...
--   supabase secrets set RESEND_FROM="AfetHUB <bildirim@afethub.com>"   (optional)
--   supabase secrets set APP_ORIGIN=https://afethub.com                 (optional)
-- The function needs no service-role key: it forwards the caller's own token to
-- staff_invite_context() above, which is what performs the admin check.
--
-- Note: nothing here sends e-mail. Delivery is the `send-staff-invite` Edge Function,
-- which renders fixed server-side templates and refuses callers that are not admins —
-- unlike the older generic `send-email` function, which accepts client-supplied HTML and
-- is an open relay (see the warning in its own source).
