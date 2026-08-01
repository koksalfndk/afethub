-- AfetHUB — migration 0026
-- İletişim formuna isteğe bağlı alanlar ve dosya eki.
--
-- Two things happen here, and the second one is the sensitive one.
--
-- 1) Optional fields: phone, province/district, website. All optional and all empty by
--    default — the form must not start asking for more than it needs to answer a
--    message (rules/03 §Data Minimization). They exist because a coordinator answering
--    "kurumumuz yardım etmek istiyor" can do something with a phone number and a city
--    that they cannot do with an e-mail address alone.
--
-- 2) File attachments. A public, account-free upload is the most dangerous surface this
--    product has, so the rules are set here rather than in the browser:
--      * a PRIVATE bucket — a stranger's document (a photo of a damaged house, an
--        institution's letterhead, whatever they choose to send) must not sit on a
--        guessable public URL. Coordinators reach it through short-lived signed URLs.
--      * an allow-list of types, enforced by the bucket, not by the file picker.
--        SVG and HTML are excluded on purpose: both execute script in a browser. Office
--        macro formats (docm/xlsm) and archives are excluded for the same reason —
--        nothing we store should be able to run anywhere.
--      * 8 MB per file, enforced by the bucket.
--      * at most 5 files per message, enforced below.
--      * the stored name is generated; the visitor's file name is kept as a label only.
--        "Do not trust file extensions" means the extension never decides anything.
--
-- Honest limit: the browser uploads straight to storage, so someone can burn bytes by
-- uploading without ever sending a message. The bucket caps size and type, and objects
-- are written under the message id, but orphan cleanup is a scheduled job that does not
-- exist yet. It is a cost problem, not a data-exposure one — the bucket is private.
--
-- Additive and idempotent.
-- =============================================================================

alter table contact_messages add column if not exists phone    text not null default '';
alter table contact_messages add column if not exists province text not null default '';
alter table contact_messages add column if not exists district text not null default '';
alter table contact_messages add column if not exists website  text not null default '';

-- Bounds, not formats: a phone number written by a person in a hurry is not a regex
-- problem, but 400 characters in a phone field is.
alter table contact_messages drop constraint if exists contact_extra_len;
alter table contact_messages add constraint contact_extra_len check (
  length(phone) <= 32 and length(province) <= 60 and length(district) <= 60 and length(website) <= 200
);

-- ---------- Attachments --------------------------------------------------------
create table if not exists contact_attachments (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references contact_messages(id) on delete cascade,
  -- Object path inside the private bucket. Never a URL: the app decides where files are
  -- fetched from, and a stored host would let a row point the panel at a third party.
  path       text not null,
  name       text not null,   -- what the visitor called it, shown as a label
  mime       text not null,
  bytes      bigint not null,
  created_at timestamptz not null default now(),
  constraint contact_att_bytes check (bytes > 0 and bytes <= 8388608),
  constraint contact_att_name  check (length(btrim(name)) between 1 and 200),
  constraint contact_att_path  check (path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$'),
  constraint contact_att_mime  check (mime in (
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  ))
);
create index if not exists contact_attachments_msg_idx on contact_attachments (message_id);

alter table contact_attachments enable row level security;
drop policy if exists contact_att_read on contact_attachments;
create policy contact_att_read on contact_attachments for select using (is_coordinator());
-- No insert policy: rows are written by the function below, which checks the message.

-- Registering the uploaded files against a message.
--
-- Separate from submit_contact_message because the upload needs the message id as its
-- folder: the file lands under <message_id>/<name>, so an object can always be traced
-- to the message that justifies it. Same short window as the mailer context — a message
-- id is not a standing permission to write rows.
create or replace function attach_contact_files(p_id uuid, p_files jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_ok    boolean;
  v_n     integer := 0;
  v_file  jsonb;
  v_path  text;
begin
  select true into v_ok from contact_messages c
   where c.id = p_id
     and c.created_at > now() - interval '15 minutes'
   for update;
  if v_ok is not true then
    raise exception 'not authorized';
  end if;

  -- One registration per message: a retry must not double the list.
  if exists (select 1 from contact_attachments a where a.message_id = p_id) then
    return 0;
  end if;

  if jsonb_typeof(p_files) <> 'array' then
    raise exception 'files must be an array';
  end if;
  if jsonb_array_length(p_files) > 5 then
    raise exception 'too many files';
  end if;

  for v_file in select * from jsonb_array_elements(p_files) loop
    v_path := coalesce(v_file->>'path', '');
    -- The folder IS the message id. The check constraint only says "<uuid>/<name>";
    -- without this line a caller could point a row at another message's object.
    if v_path not like p_id::text || '/%' then
      raise exception 'path does not belong to this message';
    end if;

    insert into contact_attachments (message_id, path, name, mime, bytes)
    values (
      p_id,
      v_path,
      left(btrim(coalesce(v_file->>'name', 'dosya')), 200),
      v_file->>'mime',
      (v_file->>'bytes')::bigint
    );
    v_n := v_n + 1;
  end loop;

  return v_n;
end $$;
revoke all on function attach_contact_files(uuid, jsonb) from public;
grant execute on function attach_contact_files(uuid, jsonb) to anon, authenticated;

-- ---------- Submitting, with the optional fields --------------------------------
-- Dropped and recreated: Postgres will not add parameters to an existing signature in
-- place, and leaving the 4-argument version behind would make the call ambiguous.
drop function if exists submit_contact_message(text, text, text, text);
create function submit_contact_message(
  p_name text, p_email text, p_topic text, p_message text,
  p_phone text default '', p_province text default '', p_district text default '',
  p_website text default ''
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_name   text := btrim(coalesce(p_name, ''));
  v_msg    text := btrim(coalesce(p_message, ''));
  v_topic  text := coalesce(nullif(btrim(p_topic), ''), 'Genel');
  v_site   text := btrim(coalesce(p_website, ''));
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
  -- A website is a link a coordinator may click, so anything that is not http(s) is
  -- refused rather than stored and rendered (javascript:, data: …).
  if v_site <> '' and v_site !~* '^https?://[^[:space:]]{3,}$' then
    raise exception 'website invalid';
  end if;

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

  insert into contact_messages (name, email, topic, message, phone, province, district, website)
  values (v_name, v_email, v_topic, v_msg,
          left(btrim(coalesce(p_phone, '')), 32),
          left(btrim(coalesce(p_province, '')), 60),
          left(btrim(coalesce(p_district, '')), 60),
          left(v_site, 200))
  returning id into v_id;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (null, v_name, 'İletişim mesajı alındı', v_topic, '—', 'Yeni', '#2A6FB0');

  return v_id;
end $$;
revoke all on function submit_contact_message(text, text, text, text, text, text, text, text) from public;
grant execute on function submit_contact_message(text, text, text, text, text, text, text, text) to anon, authenticated;

-- ---------- What the mailer may read --------------------------------------------
-- Widened with the optional fields and the attachment names. Still single-use and still
-- inside a 15-minute window; the recipient still comes from the row.
drop function if exists contact_message_context(uuid);
create function contact_message_context(p_id uuid)
returns table (
  name text, email text, topic text, message text,
  phone text, province text, district text, website text,
  files text[], created_at timestamptz
) language plpgsql security definer set search_path = public as $$
begin
  return query
  with touched as (
    update contact_messages c
       set team_mail_sent_at = now()
     where c.id = p_id
       and c.team_mail_sent_at is null
       and c.created_at > now() - interval '15 minutes'
    returning c.*
  )
  select t.name, t.email, t.topic, t.message,
         t.phone, t.province, t.district, t.website,
         coalesce((select array_agg(a.name || ' · ' || round(a.bytes / 1024.0) || ' KB' order by a.created_at)
                   from contact_attachments a where a.message_id = t.id), '{}'::text[]),
         t.created_at
  from touched t;
end $$;
revoke all on function contact_message_context(uuid) from public;
grant execute on function contact_message_context(uuid) to anon, authenticated;

-- ---------- Storage --------------------------------------------------------------
-- Private on purpose. The panel reads through short-lived signed URLs, so a link that
-- leaks stops working; a public bucket would mean a permanent, guessable address for a
-- stranger's document.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contact-files', 'contact-files', false, 8388608,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may write into this bucket (the form takes no account), nobody but a
-- coordinator may read or list it. Insert-only is what keeps an uploaded file from
-- being fetched back by the person who uploaded it — or by anyone guessing paths.
drop policy if exists contact_files_insert on storage.objects;
create policy contact_files_insert on storage.objects for insert
  with check (bucket_id = 'contact-files');

drop policy if exists contact_files_read on storage.objects;
create policy contact_files_read on storage.objects for select
  using (bucket_id = 'contact-files' and is_coordinator());
