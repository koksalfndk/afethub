-- AfetHUB — migration 0020
-- The applicant hears back when a coordinator approves their volunteer application.
--
-- Until now the decision only existed inside the panel: someone applied, a coordinator
-- pressed "Onayla", and the person found out by checking the site. The receipt mail told
-- them what would happen; this one tells them it happened.
--
-- Scope: approval only. A rejection is a message that needs care and a reason a
-- coordinator chose to write; sending it automatically is a separate decision and is
-- deliberately not made here.
--
-- Additive and idempotent.
-- =============================================================================

-- One mail per approval, ever. Also the abuse bound on the Edge Function: a coordinator
-- clicking twice, or a retry after a network error, cannot mail the same person again.
alter table volunteer_applications
  add column if not exists approval_mail_sent_at timestamptz;

comment on column volunteer_applications.approval_mail_sent_at is
  'Set when the approval e-mail was handed to the provider. Single-use guard.';

-- What the approval e-mail is allowed to read.
--
-- Coordinator-only, and it says so in SQL rather than in the Edge Function: the function
-- forwards the caller's own token, so a non-coordinator gets no rows and no mail is sent
-- (rules/03 §Server-Side Authorization). The recipient address comes from the row, never
-- from the request, so this cannot be pointed at a third party.
--
-- It answers only for a row that is actually Approved. If the status changes back later,
-- nothing is un-sent — which is the honest reason the mail says what approval does and
-- does not mean rather than promising a duty.
create or replace function volunteer_approval_context(p_app uuid)
returns table (
  email text, full_name text, code text, disaster_name text,
  province text, district text, skills text[], availability text, review_note text
) language plpgsql security definer set search_path = public as $$
begin
  if not is_coordinator() then
    raise exception 'not authorized';
  end if;

  return query
  update volunteer_applications v
     set approval_mail_sent_at = now()
   where v.id = p_app
     and v.status = 'Approved'
     and v.approval_mail_sent_at is null
     and btrim(v.email) <> ''
  returning
    v.email, v.full_name, coalesce(v.code, ''),
    coalesce((select d.name from disasters d where d.id = v.disaster_id), ''),
    v.province, v.district, v.skills, v.availability, v.review_note;
end $$;
revoke all on function volunteer_approval_context(uuid) from public, anon;
grant execute on function volunteer_approval_context(uuid) to authenticated;

-- ---------- Deployment note ------------------------------------------------------
--   supabase functions deploy send-volunteer-approved      (verify_jwt = true)
-- Same secrets as the other two mailers (RESEND_API_KEY, RESEND_FROM, APP_ORIGIN) and
-- no service-role key: the caller's token is what authorises the read above.
