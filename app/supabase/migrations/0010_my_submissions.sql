-- AfetHUB — migration 0010
-- "Gönderilerim": the signed-in account's own submissions.
--
-- Why an RPC and not a policy on `submissions`: the table carries contributor name,
-- e-mail, phone and city. Opening it to `select` for matching rows would hand those
-- columns to the browser even if the UI never rendered them, which is exactly what
-- rules/05 §Public and Private Views forbids. This function returns the same non-PII
-- shape as track_submission() and nothing else.
--
-- The caller's address is read from the session INSIDE the function. It takes no
-- e-mail parameter on purpose: a parameter would let any signed-in account enumerate
-- someone else's submissions by guessing addresses.
--
-- Additive and idempotent.
-- =============================================================================

create or replace function my_submissions()
returns table (
  code text, need_id uuid, need_name text, qty integer, unit text, location_name text,
  submitted_at timestamptz, status submission_status, verified_qty integer,
  note text, photo_url text
) language sql security definer set search_path = public, auth as $$
  select s.code, s.need_id, n.name, s.qty, s.unit, s.location_name,
         s.submitted_at, s.status, s.verified_qty, s.note, s.photo_url
  from submissions s
  join needs n on n.id = s.need_id
  where auth.uid() is not null
    and lower(btrim(s.contributor_email)) = (
      select lower(btrim(u.email)) from auth.users u where u.id = auth.uid()
    )
  order by s.submitted_at desc;
$$;

-- Anonymous callers get nothing: auth.uid() is null, so the where-clause is false.
-- Granting to anon as well would still return zero rows, but keeping the grant to
-- authenticated only makes the intent explicit.
revoke all on function my_submissions() from public, anon;
grant execute on function my_submissions() to authenticated;

-- Note: matching on e-mail rather than a user id is a consequence of the guest-first
-- design — a submission is made without an account and only later associated with one
-- (CLAUDE.md §Primary Product Rule, rules/02 §Guest Submissions). It follows that a
-- delivery reported with a different address will not appear here; the code + e-mail
-- form remains the way to reach those, and the UI says so.
