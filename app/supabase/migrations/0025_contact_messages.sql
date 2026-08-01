-- AfetHUB — migration 0025
-- İletişim: a public contact form whose messages survive the e-mail.
--
-- The message is written to the database FIRST and mailed second. If Resend refuses the
-- request, or accepts it and then fails delivery — which has already happened once on
-- this project — the message is still in the panel. A contact form that exists only as
-- an outbound e-mail quietly loses whatever it fails to deliver, and the person who
-- wrote it has no way of knowing.
--
-- No insert policy is granted on the table. The only way in is submit_contact_message(),
-- because the validation and the rate limits have to be on the server: a form open to
-- everyone, with no account, is the most exposed surface the product has
-- (rules/03 §Abuse Prevention, §Input Validation).
--
-- Honest limit: the rate limit is keyed on the e-mail address, so it bounds how much
-- mail one address can trigger — including how often a stranger can make US mail a third
-- party. It does not stop someone who cycles addresses; that needs an IP/edge limit,
-- which belongs in front of the API, not in this function.
--
-- Additive and idempotent.
-- =============================================================================

create table if not exists contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  topic       text not null default 'Genel',
  message     text not null,
  status      text not null default 'Yeni',
  handled_by  uuid references auth.users(id) on delete set null,
  handled_at  timestamptz,
  -- Set when the notification was handed to the provider. Also the single-use guard the
  -- Edge Function reads through: one message, one notification.
  team_mail_sent_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint contact_name_len  check (length(btrim(name)) between 2 and 120),
  constraint contact_email_fmt check (email ~* '^[^@[:space:]]+@[^@[:space:].]+\.[^@[:space:]]+$'),
  constraint contact_msg_len   check (length(btrim(message)) between 20 and 4000),
  constraint contact_topic_ok  check (topic in ('Genel', 'Kurum', 'Gönüllü', 'Basın', 'Teknik', 'Diğer')),
  constraint contact_status_ok check (status in ('Yeni', 'Okundu', 'Kapatıldı'))
);

create index if not exists contact_messages_created_idx on contact_messages (created_at desc);
create index if not exists contact_messages_email_idx on contact_messages (lower(btrim(email)), created_at desc);

alter table contact_messages enable row level security;

-- Coordinators read it: answering these messages is the job. Nobody else does — a
-- message here carries the writer's address and whatever they chose to tell us.
drop policy if exists contact_read on contact_messages;
create policy contact_read on contact_messages for select using (is_coordinator());
-- Deliberately no insert/update/delete policy. Writes go through the functions below.

-- ---------- Submitting ---------------------------------------------------------
create or replace function submit_contact_message(
  p_name text, p_email text, p_topic text, p_message text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_name   text := btrim(coalesce(p_name, ''));
  v_msg    text := btrim(coalesce(p_message, ''));
  v_topic  text := coalesce(nullif(btrim(p_topic), ''), 'Genel');
  v_n      integer;
begin
  if length(v_name) < 2 then
    raise exception 'name required';
  end if;
  if v_email !~* '^[^@[:space:]]+@[^@[:space:].]+\.[^@[:space:]]+$' then
    raise exception 'email invalid';
  end if;
  if length(v_msg) < 20 then
    raise exception 'message too short';
  end if;
  if length(v_msg) > 4000 then
    raise exception 'message too long';
  end if;
  if v_topic not in ('Genel', 'Kurum', 'Gönüllü', 'Basın', 'Teknik', 'Diğer') then
    v_topic := 'Diğer';
  end if;

  -- A repeat of the same message is a double-click or a network retry, not a second
  -- message: give back the row that already exists instead of a duplicate and a second
  -- e-mail (rules/03 §Idempotency).
  select c.id into v_id
  from contact_messages c
  where lower(btrim(c.email)) = v_email
    and btrim(c.message) = v_msg
    and c.created_at > now() - interval '10 minutes'
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select count(*) into v_n from contact_messages c
   where lower(btrim(c.email)) = v_email and c.created_at > now() - interval '15 minutes';
  if v_n >= 3 then
    raise exception 'rate limited';
  end if;
  select count(*) into v_n from contact_messages c
   where lower(btrim(c.email)) = v_email and c.created_at > now() - interval '24 hours';
  if v_n >= 10 then
    raise exception 'rate limited';
  end if;

  insert into contact_messages (name, email, topic, message)
  values (v_name, v_email, v_topic, v_msg)
  returning id into v_id;

  -- Not on the public allow-list (audit_is_public): this names a person and quotes a
  -- private message. It belongs in the admin system log, not in the visitor feed.
  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (null, v_name, 'İletişim mesajı alındı', v_topic, '—', 'Yeni', '#2A6FB0');

  return v_id;
end $$;
revoke all on function submit_contact_message(text, text, text, text) from public;
grant execute on function submit_contact_message(text, text, text, text) to anon, authenticated;

-- ---------- What the mailer may read -------------------------------------------
-- Same shape as volunteer_receipt_context (0018): single use, short window, and the
-- recipient comes from the row rather than from the request — so this cannot be pointed
-- at a third party, and it cannot be replayed to mail the same person twice.
create or replace function contact_message_context(p_id uuid)
returns table (name text, email text, topic text, message text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  return query
  update contact_messages c
     set team_mail_sent_at = now()
   where c.id = p_id
     and c.team_mail_sent_at is null
     and c.created_at > now() - interval '15 minutes'
  returning c.name, c.email, c.topic, c.message, c.created_at;
end $$;
revoke all on function contact_message_context(uuid) from public;
grant execute on function contact_message_context(uuid) to anon, authenticated;

-- ---------- Working through the queue -------------------------------------------
-- A function rather than an update policy: a coordinator marking a message read must not
-- also be able to rewrite what the person wrote. The record of an incoming message is
-- not ours to edit.
create or replace function set_contact_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_before text; v_name text;
begin
  if not is_coordinator() then
    raise exception 'not authorized';
  end if;
  if p_status not in ('Yeni', 'Okundu', 'Kapatıldı') then
    raise exception 'invalid status';
  end if;

  select c.status, c.name into v_before, v_name from contact_messages c where c.id = p_id for update;
  if v_before is null then
    raise exception 'not found';
  end if;
  if v_before = p_status then
    return;
  end if;

  update contact_messages
     set status = p_status,
         handled_by = auth.uid(),
         handled_at = case when p_status = 'Yeni' then null else now() end
   where id = p_id;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (null, coalesce((select p.full_name from profiles p where p.id = auth.uid()), 'Koordinatör'),
          'İletişim mesajı güncellendi', v_name, v_before, p_status, '#2A6FB0');
end $$;
revoke all on function set_contact_status(uuid, text) from public, anon;
grant execute on function set_contact_status(uuid, text) to authenticated;

-- ---------- Deployment note -------------------------------------------------------
--   supabase functions deploy send-contact      (verify_jwt = false)
-- Secrets: RESEND_API_KEY, RESEND_FROM, APP_ORIGIN (as the other mailers) plus
--   CONTACT_TO — the inbox the notification goes to. It is an environment value, never
--   a request field: a recipient the caller can name is an open relay.
