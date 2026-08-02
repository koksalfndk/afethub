-- AfetHUB — migration 0038
-- Saha Güncellemeleri: operasyon sayfasının canlı akışı.
--
-- Bu bir SOHBET ODASI DEĞİL. rules/08 §Explicitly Out of Scope "social feed" ve
-- "direct messaging between all users" maddelerini kapatıyor; buradaki modül ikisi de
-- değil. Fark modelin kendisinde yazılı:
--   * her kaydın bir TÜRÜ var (kim, ne amaçla yazdı)
--   * varsayılan yayın durumu 'moderation_pending' — kimse doğrudan yayın yapamaz
--   * kayıtlar bir kişiye değil bir OPERASYONA ve çoğu zaman bir ihtiyaca/teslim
--     noktasına bağlı
--   * silme yok; reddedilen ve gizlenen içerik kaydı korunur (rules/05 §Soft Deletion)
--
-- GİZLİLİK MİMARİSİ — bu dosyanın en önemli kararı:
-- `operation_updates` tablosu KİŞİSEL VERİ TAŞIMAZ. Gönderenin adı, e-postası ve
-- telefonu ayrı bir tabloda (`operation_update_contacts`) durur ve anon rolüne hiçbir
-- yetki verilmez. Ana tabloda kalan hassas sütunlar (author_user_id, moderasyon notu,
-- PII bayrağı) sütun bazlı GRANT ile herkese açık okumanın dışında tutulur.
-- Böylece Faz 4'te Realtime doğrudan bu tabloyu dinleyebilir: yayınlanmış bir satırın
-- tamamı sızsa bile ortada bir isim ya da adres yoktur.
-- (rules/01 §Public Access, rules/03 §Data Minimization, rules/05 §Public and Private Views)
-- =============================================================================

-- ---------- 1) Tipler --------------------------------------------------------
do $$ begin
  create type operation_update_type as enum (
    'coordinator_update', -- Koordinatör Güncellemesi
    'institution_update', -- Kurum Güncellemesi
    'field_report',       -- Saha Bildirimi
    'delivery_update',    -- Teslimat Güncellemesi
    'need_update',        -- İhtiyaç Güncellemesi
    'safety_notice',      -- Güvenlik Uyarısı
    'public_comment',     -- Kullanıcı Yorumu
    'system_event'        -- Sistem Kaydı
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type operation_update_status as enum (
    'draft', 'moderation_pending', 'published', 'rejected', 'hidden', 'corrected', 'archived'
  );
exception when duplicate_object then null; end $$;

-- ---------- 2) Güncellemeler -------------------------------------------------
create table if not exists operation_updates (
  id                          uuid primary key default gen_random_uuid(),
  disaster_id                 uuid not null references disasters(id) on delete cascade,
  update_type                 operation_update_type not null,
  status                      operation_update_status not null default 'moderation_pending',
  -- 'unverified' varsayılan. Bir koordinatör kendi yazdığını yayınladığında
  -- 'coordinator_verified' olur. Onay bekleyen içerik herkese açık akışta kesin bilgi
  -- gibi gösterilemez (rules/07 §Critical Distinctions).
  verification_status         text not null default 'unverified'
                              check (verification_status in ('unverified', 'coordinator_verified')),
  author_type                 text not null
                              check (author_type in ('coordinator','institution','volunteer','user','guest','system')),
  -- Ekranda görünecek ad, YAZILDIĞI ANDA sabitlenir: "Seydikemer Koordinasyon Ekibi",
  -- "Doğrulanmış kullanıcı", "Misafir". Kişi adı geçtiğinde maskelenmiş biçimdedir
  -- (mask_actor, 0024). Sonradan profil adı değişse bile kayıt olduğu gibi kalır —
  -- bir olay kaydı sonradan değişiyorsa kayıt değildir.
  author_label                text not null default '',
  organization_id             uuid references organizations(id) on delete set null,
  body                        text not null,
  related_need_id             uuid references needs(id) on delete set null,
  related_delivery_location_id uuid references locations(id) on delete set null,
  -- YAKLAŞIK bölge, açık adres değil. Serbest metin ama kısa ve moderasyondan geçer.
  approximate_location        text not null default '',
  is_pinned                   boolean not null default false,
  pinned_until                timestamptz,
  -- Yanlış bilgi düzeltmesi: yeni kayıt eskisini işaret eder, eskisi 'corrected' olur.
  corrects_update_id          uuid references operation_updates(id) on delete set null,
  published_at                timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  -- ---- Aşağıdaki sütunlar herkese açık okumaya KAPALI (bkz. GRANT bölümü) ----
  author_user_id              uuid references auth.users(id) on delete set null,
  moderated_by                uuid references auth.users(id) on delete set null,
  moderated_at                timestamptz,
  moderation_reason           text not null default '',
  -- Metinde telefon/e-posta kalıbı bulundu. Bulunması içeriği reddetmez; doğrudan
  -- yayına çıkmasını engeller.
  pii_flagged                 boolean not null default false
);

do $$ begin
  alter table operation_updates
    add constraint operation_updates_body_len check (length(btrim(body)) between 3 and 1200);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table operation_updates
    add constraint operation_updates_approx_len check (length(approximate_location) <= 120);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table operation_updates
    add constraint operation_updates_published_has_time
      check (status <> 'published' or published_at is not null);
exception when duplicate_object then null; end $$;

create index if not exists operation_updates_feed_idx
  on operation_updates (disaster_id, published_at desc)
  where status = 'published';
create index if not exists operation_updates_queue_idx
  on operation_updates (status, created_at)
  where status = 'moderation_pending';
create index if not exists operation_updates_pinned_idx
  on operation_updates (disaster_id) where is_pinned = true;
create index if not exists operation_updates_author_idx on operation_updates (author_user_id);

comment on table operation_updates is
  'Operation activity feed. Contains NO personal data — contact details live in operation_update_contacts.';

-- ---------- 3) Gönderen iletişim bilgisi (özel) ------------------------------
-- Ayrı tablo, çünkü tek amacı moderasyon: bir gönderiye açıklama sorulabilsin ve
-- kötüye kullanım sınırlanabilsin. Hiçbir herkese açık yüzeye çıkmaz.
create table if not exists operation_update_contacts (
  operation_update_id uuid primary key references operation_updates(id) on delete cascade,
  name                text not null default '',
  email               text not null default '',
  phone               text not null default '',
  created_at          timestamptz not null default now()
);
create index if not exists operation_update_contacts_email_idx
  on operation_update_contacts (lower(email));

-- ---------- 4) Ekler ---------------------------------------------------------
create table if not exists operation_update_attachments (
  id                  uuid primary key default gen_random_uuid(),
  operation_update_id uuid not null references operation_updates(id) on delete cascade,
  -- Özel kovadaki nesne yolu. URL değil: bağlantıyı uygulama üretir ve kısa ömürlüdür.
  storage_path        text not null unique,
  file_type           text not null,
  file_size           integer not null check (file_size > 0 and file_size <= 8388608),
  width               integer,
  height              integer,
  caption             text not null default '',
  captured_at         timestamptz,
  -- "Yeşilüzümlü çevresi" gibi YAKLAŞIK yer. Açık adres değil.
  public_location_text text not null default '',
  moderation_status   text not null default 'pending'
                      check (moderation_status in ('pending','approved','rejected')),
  moderation_reason   text not null default '',
  moderated_by        uuid references auth.users(id) on delete set null,
  moderated_at        timestamptz,
  created_at          timestamptz not null default now()
);
do $$ begin
  alter table operation_update_attachments
    add constraint operation_update_attachments_mime
      check (file_type in ('image/webp','image/jpeg','image/png'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table operation_update_attachments
    add constraint operation_update_attachments_caption_len
      check (length(caption) <= 240 and length(public_location_text) <= 120);
exception when duplicate_object then null; end $$;

create index if not exists operation_update_attachments_update_idx
  on operation_update_attachments (operation_update_id);
create index if not exists operation_update_attachments_gallery_idx
  on operation_update_attachments (moderation_status, created_at desc);

-- ---------- 5) Raporlar ------------------------------------------------------
create table if not exists operation_update_reports (
  id                  uuid primary key default gen_random_uuid(),
  operation_update_id uuid not null references operation_updates(id) on delete cascade,
  reason              text not null
                      check (reason in ('wrong_info','personal_data','safety_risk','spam',
                                        'inappropriate','duplicate','off_topic')),
  note                text not null default '',
  reporter_user_id    uuid references auth.users(id) on delete set null,
  status              text not null default 'open' check (status in ('open','reviewed','dismissed')),
  reviewed_by         uuid references auth.users(id) on delete set null,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now()
);
do $$ begin
  alter table operation_update_reports
    add constraint operation_update_reports_note_len check (length(note) <= 500);
exception when duplicate_object then null; end $$;
create index if not exists operation_update_reports_open_idx
  on operation_update_reports (status, created_at desc);

-- ---------- 6) RLS + sütun bazlı yetki --------------------------------------
alter table operation_updates            enable row level security;
alter table operation_update_contacts    enable row level security;
alter table operation_update_attachments enable row level security;
alter table operation_update_reports     enable row level security;

-- Ana tablo: yalnızca YAYINLANMIŞ satırlar, yalnızca güvenli sütunlar.
-- INSERT/UPDATE politikası yok — tek yazma yolu aşağıdaki SECURITY DEFINER işlevleri.
revoke all on operation_updates from anon, authenticated;
grant select (
  id, disaster_id, update_type, status, verification_status, author_type, author_label,
  organization_id, body, related_need_id, related_delivery_location_id, approximate_location,
  is_pinned, pinned_until, corrects_update_id, published_at, created_at, updated_at
) on operation_updates to anon, authenticated;

drop policy if exists operation_updates_public_read on operation_updates;
create policy operation_updates_public_read on operation_updates
  for select using (status = 'published');

-- Kişi kendi gönderisinin akıbetini görebilsin (hesabı varsa) — yine yalnızca
-- yukarıda verilen güvenli sütunlar.
drop policy if exists operation_updates_own_read on operation_updates;
create policy operation_updates_own_read on operation_updates
  for select using (author_user_id is not null and author_user_id = auth.uid());

-- KOORDİNATÖRE TABLO ERİŞİMİ VERİLMEDİ. Moderasyon kuyruğu aşağıdaki SECURITY
-- DEFINER işleviyle okunur (`coordinator_pending_queue` ile aynı desen, 0025).
-- Gerekçe: bir tablo yetkisi verildiğinde o yetki bütün sütunlara açılır ve aynı
-- yetkiye sahip her oturum moderasyon notlarını, yazar kimliğini ve PII bayrağını da
-- okuyabilir. Kuyruğu bir işlevle vermek, ne döndüğünün tek bir yerde yazılı olması
-- demek (rules/05 §Public and Private Views).

-- İletişim tablosu: hiçbir role doğrudan yetki yok.
revoke all on operation_update_contacts from anon, authenticated;

-- Ekler: ONAYLI ek + YAYINLANMIŞ güncelleme. Onaysız bir fotoğrafın yolu bile
-- herkese açık yanıtta görünmez.
drop policy if exists operation_update_attachments_public_read on operation_update_attachments;
create policy operation_update_attachments_public_read on operation_update_attachments
  for select using (
    moderation_status = 'approved'
    and exists (select 1 from operation_updates u
                 where u.id = operation_update_id and u.status = 'published')
  );
revoke all on operation_update_attachments from anon, authenticated;
grant select (
  id, operation_update_id, storage_path, file_type, width, height,
  caption, captured_at, public_location_text, moderation_status, created_at
) on operation_update_attachments to anon, authenticated;

-- Raporlar: hiçbir role doğrudan yetki yok. Kimin neyi raporladığı herkese açık olamaz.
revoke all on operation_update_reports from anon, authenticated;

-- ---------- 7) PII kalıbı ----------------------------------------------------
-- Kesin değil, uyarıcı. Amaç: metne düşen bir telefon numarası ya da e-posta adresi
-- moderasyondan geçmeden yayına çıkmasın (rules/03 §Data Minimization).
create or replace function operation_update_pii_flag(p_body text)
returns boolean language sql immutable set search_path = public as $$
  select
    coalesce(p_body, '') ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}'
    or coalesce(p_body, '') ~ '(^|[^0-9])(\+?90[ .-]?)?0?5[0-9]{2}[ .-]?[0-9]{3}[ .-]?[0-9]{2}[ .-]?[0-9]{2}([^0-9]|$)'
    or length(regexp_replace(coalesce(p_body, ''), '[^0-9]', '', 'g')) >= 11;
$$;

-- ---------- 8) Güncelleme gönderme ------------------------------------------
create or replace function submit_operation_update(
  p_disaster    uuid,
  p_type        operation_update_type,
  p_body        text,
  p_related_need     uuid default null,
  p_related_location uuid default null,
  p_approximate_location text default '',
  p_name  text default '',
  p_email text default '',
  p_phone text default ''
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  d          disasters;
  v_coord    boolean := is_coordinator();
  v_org      uuid    := my_writable_org();
  v_type     operation_update_type := p_type;
  v_status   operation_update_status;
  v_author   text;
  v_label    text;
  v_pii      boolean;
  v_id       uuid;
  v_existing uuid;
  v_email    text := lower(btrim(coalesce(p_email, '')));
begin
  if length(btrim(coalesce(p_body, ''))) < 3 or length(btrim(coalesce(p_body, ''))) > 1200 then
    raise exception 'Update text must be between 3 and 1200 characters';
  end if;
  if length(coalesce(p_approximate_location, '')) > 120 then
    raise exception 'Location note is too long';
  end if;

  select * into d from disasters where id = p_disaster;
  if not found then raise exception 'Operation not found'; end if;
  if d.status = 'Archived' then
    raise exception 'This operation is archived'; end if;

  -- Kim ne yazabilir. 'system_event' yalnızca veritabanının kendisi içindir; hiçbir
  -- kullanıcı yolu buraya ulaşamaz.
  if v_type = 'system_event' then
    raise exception 'system_event is written by the platform only';
  end if;
  if v_coord then
    v_author := 'coordinator';
  elsif v_org is not null then
    v_author := 'institution';
    if v_type not in ('institution_update', 'field_report') then
      raise exception 'An institution may post an institution update or a field report';
    end if;
  elsif auth.uid() is not null then
    v_author := 'user';
    if v_type not in ('field_report', 'public_comment') then
      raise exception 'This update type is not available to you';
    end if;
  else
    v_author := 'guest';
    if v_type not in ('field_report', 'public_comment') then
      raise exception 'This update type is not available to you';
    end if;
    -- Moderasyon geri dönüş yapabilsin ve kötüye kullanım sınırlanabilsin diye.
    if v_email = '' then
      raise exception 'An e-mail address is required to send a field report';
    end if;
  end if;

  if p_related_need is not null and not exists (
    select 1 from needs n where n.id = p_related_need and n.disaster_id = d.id
  ) then raise exception 'The need does not belong to this operation'; end if;
  if p_related_location is not null and not exists (
    select 1 from locations l where l.id = p_related_location and l.disaster_id = d.id
  ) then raise exception 'The delivery point does not belong to this operation'; end if;

  -- Ağ tekrarı ikinci bir kayıt üretmemeli (rules/03 §Idempotency).
  select u.id into v_existing
    from operation_updates u
   where u.disaster_id = d.id
     and btrim(u.body) = btrim(p_body)
     and u.created_at > now() - interval '10 minutes'
     and (
       (auth.uid() is not null and u.author_user_id = auth.uid())
       or (auth.uid() is null and exists (
             select 1 from operation_update_contacts c
              where c.operation_update_id = u.id and lower(c.email) = v_email))
     )
   limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Kaba kullanım freni.
  if auth.uid() is not null then
    if (select count(*) from operation_updates u
         where u.disaster_id = d.id and u.author_user_id = auth.uid()
           and u.created_at > now() - interval '1 hour') >= 10 then
      raise exception 'Too many updates in the last hour, please try again later';
    end if;
  else
    if (select count(*) from operation_updates u
          join operation_update_contacts c on c.operation_update_id = u.id
         where u.disaster_id = d.id and lower(c.email) = v_email
           and u.created_at > now() - interval '1 hour') >= 5 then
      raise exception 'Too many updates in the last hour, please try again later';
    end if;
  end if;

  v_pii := operation_update_pii_flag(p_body);

  -- Yayın kararı. GÜVENLİ VARSAYILAN: koordinatör dışında herkes moderasyona düşer
  -- (direktif §5.2 "İlk üretim sürümünde güvenli varsayılan olarak ön moderasyon").
  if v_coord then
    v_status := 'published';
  else
    v_status := 'moderation_pending';
  end if;

  -- Etiket. Kişi adı yalnızca maskelenmiş biçimde ve yalnızca kurum adı yoksa.
  if v_author = 'coordinator' then
    v_label := coalesce(
      (select o.name from organizations o where o.id = v_org and o.status = 'Verified'),
      nullif(mask_actor((select full_name from profiles where id = auth.uid())), ''),
      'Koordinasyon Ekibi');
  elsif v_author = 'institution' then
    v_label := coalesce((select o.name from organizations o where o.id = v_org), 'Kurum');
  elsif v_author = 'user' then
    v_label := 'Doğrulanmış kullanıcı';
  else
    v_label := 'Misafir';
  end if;

  insert into operation_updates (
    disaster_id, update_type, status, verification_status, author_type, author_label,
    organization_id, body, related_need_id, related_delivery_location_id,
    approximate_location, published_at, author_user_id, pii_flagged
  ) values (
    d.id, v_type, v_status,
    case when v_coord then 'coordinator_verified' else 'unverified' end,
    v_author, v_label,
    case when v_author in ('coordinator', 'institution') then v_org else null end,
    btrim(p_body), p_related_need, p_related_location,
    btrim(coalesce(p_approximate_location, '')),
    case when v_status = 'published' then now() else null end,
    auth.uid(), v_pii
  ) returning id into v_id;

  if btrim(coalesce(p_name, '')) <> '' or v_email <> '' or btrim(coalesce(p_phone, '')) <> '' then
    insert into operation_update_contacts (operation_update_id, name, email, phone)
    values (v_id, left(btrim(coalesce(p_name, '')), 120), v_email, left(btrim(coalesce(p_phone, '')), 40));
  end if;

  -- Yalnızca YAYINLANAN kayıt denetim akışına düşer. Moderasyon kuyruğu herkese açık
  -- kanala düşmemeli (direktif §13); kuyruğa giren gönderi için kayıt moderasyon
  -- kararında yazılır.
  if v_status = 'published' then
    insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
    values (d.id, v_label, 'Saha güncellemesi yayınlandı', left(btrim(p_body), 120), '—', v_type::text, '#2A6FB0');
  end if;

  return v_id;
end $$;

revoke all on function submit_operation_update(uuid, operation_update_type, text, uuid, uuid, text, text, text, text) from public;
grant execute on function submit_operation_update(uuid, operation_update_type, text, uuid, uuid, text, text, text, text) to anon, authenticated;

-- ---------- 9) Moderasyon ----------------------------------------------------
create or replace function moderate_operation_update(
  p_update uuid, p_action text, p_reason text default ''
) returns void
language plpgsql security definer set search_path = public as $$
declare
  u          operation_updates;
  actor_name text;
  v_new      operation_update_status;
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can moderate updates';
  end if;
  if p_action not in ('publish', 'reject', 'hide', 'archive') then
    raise exception 'Unknown moderation action';
  end if;
  if p_action in ('reject', 'hide') and btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required';
  end if;

  select * into u from operation_updates where id = p_update for update;
  if not found then raise exception 'Update not found'; end if;

  v_new := case p_action
             when 'publish' then 'published'
             when 'reject'  then 'rejected'
             when 'hide'    then 'hidden'
             else 'archived' end::operation_update_status;

  select coalesce(full_name, 'Koordinatör') into actor_name from profiles where id = auth.uid();

  update operation_updates set
    status            = v_new,
    published_at      = case when v_new = 'published' then coalesce(published_at, now()) else published_at end,
    is_pinned         = case when v_new = 'published' then is_pinned else false end,
    verification_status = case when v_new = 'published' then 'coordinator_verified' else verification_status end,
    moderated_by      = auth.uid(),
    moderated_at      = now(),
    moderation_reason = left(btrim(coalesce(p_reason, '')), 500),
    updated_at        = now()
  where id = u.id;

  -- Reddetme ve gizleme herkese açık akışa DÜŞMEZ: bir moderasyon kararı, adı geçen
  -- kişi hakkında herkese açık bir hüküm olurdu (0016'daki "Kurum reddedildi" ile
  -- aynı gerekçe). Yayınlama düşer.
  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (
    u.disaster_id, actor_name,
    case when p_action = 'publish' then 'Saha güncellemesi yayınlandı' else 'Saha güncellemesi moderasyonu' end,
    left(u.body, 120), u.status::text, v_new::text,
    case p_action when 'publish' then '#159947' when 'reject' then '#D9363E' else '#E6A700' end
  );
end $$;
revoke all on function moderate_operation_update(uuid, text, text) from public, anon;
grant execute on function moderate_operation_update(uuid, text, text) to authenticated;

-- ---------- 10) Sabitleme ----------------------------------------------------
-- En fazla 3: akışın üstü kalabalıklaşırsa sabitlemek anlamını yitirir.
create or replace function pin_operation_update(
  p_update uuid, p_pinned boolean, p_until timestamptz default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  u          operation_updates;
  actor_name text;
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can pin updates';
  end if;
  select * into u from operation_updates where id = p_update for update;
  if not found then raise exception 'Update not found'; end if;
  if p_pinned and u.status <> 'published' then
    raise exception 'Only a published update can be pinned';
  end if;
  if p_pinned and (select count(*) from operation_updates
                    where disaster_id = u.disaster_id and is_pinned = true and id <> u.id) >= 3 then
    raise exception 'At most 3 updates can be pinned';
  end if;
  if p_pinned and p_until is not null and p_until <= now() then
    raise exception 'The pin expiry must be in the future';
  end if;

  update operation_updates
     set is_pinned = p_pinned,
         pinned_until = case when p_pinned then p_until else null end,
         updated_at = now()
   where id = u.id;

  select coalesce(full_name, 'Koordinatör') into actor_name from profiles where id = auth.uid();
  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (u.disaster_id, actor_name, 'Saha güncellemesi sabitlendi', left(u.body, 120),
          u.is_pinned::text, p_pinned::text, '#2A6FB0');
end $$;
revoke all on function pin_operation_update(uuid, boolean, timestamptz) from public, anon;
grant execute on function pin_operation_update(uuid, boolean, timestamptz) to authenticated;

-- ---------- 11) Yanlış bilgi düzeltme ---------------------------------------
-- Silme DEĞİL. Eski kayıt 'corrected' olarak durur, yeni kayıt onu işaret eder ve
-- denetim kaydına eski/yeni metin birlikte yazılır (direktif §5.8).
create or replace function correct_operation_update(
  p_update uuid, p_body text, p_reason text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  u          operation_updates;
  actor_name text;
  v_label    text;
  v_new      uuid;
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can correct an update';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A correction reason is required';
  end if;
  if length(btrim(coalesce(p_body, ''))) < 3 or length(btrim(coalesce(p_body, ''))) > 1200 then
    raise exception 'Correction text must be between 3 and 1200 characters';
  end if;

  select * into u from operation_updates where id = p_update for update;
  if not found then raise exception 'Update not found'; end if;

  select coalesce(full_name, 'Koordinatör') into actor_name from profiles where id = auth.uid();
  v_label := coalesce(
    (select o.name from organizations o where o.id = my_writable_org() and o.status = 'Verified'),
    nullif(mask_actor(actor_name), ''), 'Koordinasyon Ekibi');

  insert into operation_updates (
    disaster_id, update_type, status, verification_status, author_type, author_label,
    body, related_need_id, related_delivery_location_id, approximate_location,
    corrects_update_id, published_at, author_user_id, moderated_by, moderated_at, moderation_reason
  ) values (
    u.disaster_id, u.update_type, 'published', 'coordinator_verified', 'coordinator', v_label,
    btrim(p_body), u.related_need_id, u.related_delivery_location_id, u.approximate_location,
    u.id, now(), auth.uid(), auth.uid(), now(), left(btrim(p_reason), 500)
  ) returning id into v_new;

  update operation_updates
     set status = 'corrected', is_pinned = false, updated_at = now(),
         moderated_by = auth.uid(), moderated_at = now(),
         moderation_reason = left(btrim(p_reason), 500)
   where id = u.id;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (u.disaster_id, actor_name, 'Saha güncellemesi düzeltildi',
          btrim(p_reason), left(u.body, 200), left(btrim(p_body), 200), '#E6A700');

  return v_new;
end $$;
revoke all on function correct_operation_update(uuid, text, text) from public, anon;
grant execute on function correct_operation_update(uuid, text, text) to authenticated;

-- ---------- 12) Raporlama ----------------------------------------------------
create or replace function report_operation_update(
  p_update uuid, p_reason text, p_note text default ''
) returns void
language plpgsql security definer set search_path = public as $$
declare
  u operation_updates;
begin
  if p_reason not in ('wrong_info','personal_data','safety_risk','spam','inappropriate','duplicate','off_topic') then
    raise exception 'Unknown report reason';
  end if;
  select * into u from operation_updates where id = p_update;
  if not found then raise exception 'Update not found'; end if;
  -- Yalnızca görülebilen bir içerik raporlanabilir; aksi hâlde rapor uç noktası
  -- moderasyon kuyruğunun varlığını sızdıran bir sorgu olurdu.
  if u.status <> 'published' then
    raise exception 'Update not found';
  end if;

  -- Aynı kişi aynı gönderiyi tekrar tekrar raporlayamaz.
  if auth.uid() is not null and exists (
    select 1 from operation_update_reports r
     where r.operation_update_id = u.id and r.reporter_user_id = auth.uid()
  ) then
    return;
  end if;

  insert into operation_update_reports (operation_update_id, reason, note, reporter_user_id)
  values (u.id, p_reason, left(btrim(coalesce(p_note, '')), 500), auth.uid());
end $$;
revoke all on function report_operation_update(uuid, text, text) from public;
grant execute on function report_operation_update(uuid, text, text) to anon, authenticated;

-- ---------- 13) Ek kaydı ve moderasyonu -------------------------------------
-- Nesne önce kovaya yazılır, sonra burada kaydedilir. Yol ZORUNLU olarak
-- '<disaster_id>/<update_id>/' altında: sunucu başka bir klasörü kabul etmez
-- (`attach_contact_files` ile aynı desen, 0026).
create or replace function register_update_attachment(
  p_update uuid,
  p_path   text,
  p_mime   text,
  p_bytes  integer,
  p_width  integer default null,
  p_height integer default null,
  p_caption text default '',
  p_captured_at timestamptz default null,
  p_public_location text default ''
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  u        operation_updates;
  v_prefix text;
  v_id     uuid;
  v_coord  boolean := is_coordinator();
begin
  select * into u from operation_updates where id = p_update;
  if not found then raise exception 'Update not found'; end if;

  -- Gönderiyi yazan kişi (ya da bir koordinatör) ek koyabilir.
  if not v_coord and (u.author_user_id is null or u.author_user_id <> auth.uid()) then
    -- Misafir gönderisinde oturum yok; ek yalnızca gönderi henüz moderasyondayken ve
    -- ilk 30 dakika içinde eklenebilir. Süre, formun tek bir oturumda tamamlanması için.
    if not (u.author_type = 'guest' and u.status = 'moderation_pending'
            and u.created_at > now() - interval '30 minutes') then
      raise exception 'not authorized';
    end if;
  end if;

  if p_mime not in ('image/webp','image/jpeg','image/png') then
    raise exception 'Unsupported file type';
  end if;
  if p_bytes is null or p_bytes <= 0 or p_bytes > 8388608 then
    raise exception 'File is too large';
  end if;
  if (select count(*) from operation_update_attachments where operation_update_id = u.id) >= 4 then
    raise exception 'At most 4 photos per update';
  end if;

  v_prefix := u.disaster_id::text || '/' || u.id::text || '/';
  if position(v_prefix in p_path) <> 1 or p_path ~ '\.\.' then
    raise exception 'Invalid storage path';
  end if;

  insert into operation_update_attachments (
    operation_update_id, storage_path, file_type, file_size, width, height,
    caption, captured_at, public_location_text,
    moderation_status, moderated_by, moderated_at
  ) values (
    u.id, p_path, p_mime, p_bytes, p_width, p_height,
    left(btrim(coalesce(p_caption, '')), 240), p_captured_at,
    left(btrim(coalesce(p_public_location, '')), 120),
    -- Koordinatörün kendi yüklediği görsel doğrudan onaylı; başka herkesinki beklemede.
    -- OTOMATİK YÜZ/PLAKA BULANIKLAŞTIRMA YOK: yapılmadı ve yapılmış gibi
    -- gösterilmiyor. Onay adımı bu yüzden elle (CLAUDE.md §No Fabricated Completion).
    case when v_coord then 'approved' else 'pending' end,
    case when v_coord then auth.uid() else null end,
    case when v_coord then now() else null end
  ) returning id into v_id;

  return v_id;
end $$;
revoke all on function register_update_attachment(uuid, text, text, integer, integer, integer, text, timestamptz, text) from public;
grant execute on function register_update_attachment(uuid, text, text, integer, integer, integer, text, timestamptz, text) to anon, authenticated;

create or replace function moderate_update_attachment(
  p_attachment uuid, p_status text, p_reason text default ''
) returns void
language plpgsql security definer set search_path = public as $$
declare
  a operation_update_attachments;
  actor_name text;
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can moderate photos';
  end if;
  if p_status not in ('approved', 'rejected', 'pending') then
    raise exception 'Unknown photo moderation status';
  end if;
  select * into a from operation_update_attachments where id = p_attachment for update;
  if not found then raise exception 'Photo not found'; end if;

  update operation_update_attachments
     set moderation_status = p_status,
         moderation_reason = left(btrim(coalesce(p_reason, '')), 500),
         moderated_by = auth.uid(), moderated_at = now()
   where id = a.id;

  select coalesce(full_name, 'Koordinatör') into actor_name from profiles where id = auth.uid();
  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (
    (select disaster_id from operation_updates where id = a.operation_update_id),
    actor_name, 'Saha fotoğrafı moderasyonu', '', a.moderation_status, p_status,
    case p_status when 'approved' then '#159947' when 'rejected' then '#D9363E' else '#E6A700' end
  );
end $$;
revoke all on function moderate_update_attachment(uuid, text, text) from public, anon;
grant execute on function moderate_update_attachment(uuid, text, text) to authenticated;

-- ---------- 13b) Koordinatör moderasyon kuyruğu ------------------------------
-- Tablo yetkisi yerine işlev: ne döndüğü tek bir yerde yazılı ve yetki içeride.
-- Gönderenin iletişim bilgisi BURADA taşınır — bu şekil hiçbir herkese açık ekrana
-- gitmez (rules/03 §Contact Information).
create or replace function operation_update_queue(
  p_disaster uuid default null,
  p_limit    integer default 100
) returns table (
  id uuid, disaster_id uuid, disaster_name text, update_type operation_update_type,
  status operation_update_status, author_type text, author_label text,
  body text, approximate_location text, pii_flagged boolean,
  related_need_name text, related_location_name text,
  contact_name text, contact_email text, contact_phone text,
  photo_pending integer, photo_approved integer, open_reports integer,
  created_at timestamptz, published_at timestamptz
) language plpgsql security definer set search_path = public as $$
begin
  if not is_coordinator() then
    raise exception 'not authorized';
  end if;
  return query
    select u.id, u.disaster_id, d.name, u.update_type, u.status, u.author_type, u.author_label,
           u.body, u.approximate_location, u.pii_flagged,
           coalesce(n.name, ''), coalesce(l.name, ''),
           coalesce(c.name, ''), coalesce(c.email, ''), coalesce(c.phone, ''),
           (select count(*)::int from operation_update_attachments a
             where a.operation_update_id = u.id and a.moderation_status = 'pending'),
           (select count(*)::int from operation_update_attachments a
             where a.operation_update_id = u.id and a.moderation_status = 'approved'),
           (select count(*)::int from operation_update_reports r
             where r.operation_update_id = u.id and r.status = 'open'),
           u.created_at, u.published_at
      from operation_updates u
      join disasters d on d.id = u.disaster_id
      left join needs n     on n.id = u.related_need_id
      left join locations l on l.id = u.related_delivery_location_id
      left join operation_update_contacts c on c.operation_update_id = u.id
     where (p_disaster is null or u.disaster_id = p_disaster)
       and (u.status = 'moderation_pending'
            or exists (select 1 from operation_update_reports r
                        where r.operation_update_id = u.id and r.status = 'open')
            or exists (select 1 from operation_update_attachments a
                        where a.operation_update_id = u.id and a.moderation_status = 'pending'))
     order by u.created_at asc
     limit greatest(1, least(coalesce(p_limit, 100), 500));
end $$;
revoke all on function operation_update_queue(uuid, integer) from public, anon;
grant execute on function operation_update_queue(uuid, integer) to authenticated;

-- ---------- 14) Herkese açık görünümler -------------------------------------
-- Akış. Sabit bir mesajın süresi dolmuşsa artık sabit değildir — bunu okuma anında
-- hesaplamak, süresi dolmuş sabitleri temizleyecek bir zamanlayıcıya bağımlı olmaktan
-- daha dürüst (olmayan bir zamanlayıcı varmış gibi davranılmıyor).
create or replace view operation_updates_public as
select
  u.id,
  u.disaster_id,
  u.update_type,
  u.verification_status,
  u.author_type,
  u.author_label,
  u.organization_id,
  u.body,
  u.related_need_id,
  n.name  as related_need_name,
  u.related_delivery_location_id,
  l.name  as related_location_name,
  u.approximate_location,
  (u.is_pinned and (u.pinned_until is null or u.pinned_until > now())) as is_pinned,
  u.pinned_until,
  u.corrects_update_id,
  u.published_at,
  u.created_at,
  (select count(*) from operation_update_attachments a
    where a.operation_update_id = u.id and a.moderation_status = 'approved') as photo_count
from operation_updates u
left join needs n     on n.id = u.related_need_id
left join locations l on l.id = u.related_delivery_location_id
where u.status = 'published';

comment on view operation_updates_public is
  'Published operation updates. Carries no personal data: author_label is a role or an institution name.';
grant select on operation_updates_public to anon, authenticated;

-- Galeri. Ayrı bir `operation_media` tablosu AÇILMADI: her fotoğraf zaten bir
-- güncellemenin eki ve iki ayrı moderasyon kuyruğu aynı nesne için iki ayrı karar
-- demek olurdu (rules/06 §Scope Control).
create or replace view operation_media_public as
select
  a.id,
  u.disaster_id,
  a.operation_update_id,
  a.storage_path,
  a.file_type,
  a.width,
  a.height,
  a.caption,
  a.captured_at,
  a.public_location_text,
  u.author_label,
  u.author_type,
  u.update_type,
  coalesce(u.published_at, u.created_at) as published_at
from operation_update_attachments a
join operation_updates u on u.id = a.operation_update_id
where a.moderation_status = 'approved' and u.status = 'published';

comment on view operation_media_public is
  'Approved photos of published updates. storage_path is an object path in a PRIVATE bucket; access still needs a signed URL.';
grant select on operation_media_public to anon, authenticated;

-- ---------- 15) Depolama -----------------------------------------------------
-- ÖZEL kova. Herkese açık bir kova, moderasyondan geçmemiş bir fotoğrafın kalıcı ve
-- tahmin edilebilir bir adresi demek olurdu (0026'daki `contact-files` ile aynı
-- gerekçe). Okuma yetkisi ONAYLI eke bağlı; galeri kısa ömürlü imzalı bağlantıyla
-- açılır.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('operation-media', 'operation-media', false, 8388608,
        array['image/webp','image/jpeg','image/png'])
on conflict (id) do update
  set public = false, file_size_limit = 8388608,
      allowed_mime_types = array['image/webp','image/jpeg','image/png'];

drop policy if exists operation_media_insert on storage.objects;
create policy operation_media_insert on storage.objects for insert
  with check (bucket_id = 'operation-media');

drop policy if exists operation_media_read on storage.objects;
create policy operation_media_read on storage.objects for select
  using (
    bucket_id = 'operation-media'
    and (
      is_coordinator()
      or exists (
        select 1
          from operation_update_attachments a
          join operation_updates u on u.id = a.operation_update_id
         where a.storage_path = storage.objects.name
           and a.moderation_status = 'approved'
           and u.status = 'published'
      )
    )
  );

drop policy if exists operation_media_coord_delete on storage.objects;
create policy operation_media_coord_delete on storage.objects for delete to authenticated
  using (bucket_id = 'operation-media' and is_coordinator());

-- ---------- 15b) Herkese açık akışta görünen aksiyonlar ----------------------
-- 0036'daki listeye bu dosyanın ürettikleri ekleniyor. 'Saha güncellemesi moderasyonu',
-- 'Saha fotoğrafı moderasyonu' ve teslim sözü kayıtları BİLEREK dışarıda: bir moderasyon
-- kararı, adı geçen kişi hakkında herkese açık bir hüküm olurdu ("Kurum reddedildi"
-- ile aynı gerekçe, 0016).
create or replace function audit_is_public(p_action text)
returns boolean language sql immutable set search_path = public as $$
  select p_action = any (array[
    'İhtiyaç oluşturuldu', 'Miktar güncellendi', 'İhtiyaç tamamlandı', 'Need completed',
    'Teslimat bildirildi', 'Teslimat doğrulandı', 'Teslimat kısmen doğrulandı', 'Teslimat reddedildi',
    'Delivery verified', 'Delivery partially verified', 'Delivery rejected',
    'Duyuru yayınlandı', 'Duyuru güncellendi', 'Duyuru kaldırıldı',
    'Teslim noktası eklendi', 'Teslim noktası güncellendi', 'Teslim noktası kaldırıldı',
    'Afet oluşturuldu', 'Afet durumu güncellendi', 'Operasyon açıldı', 'Afet kaydı güncellendi',
    'Topluluk afeti oluşturuldu', 'Topluluk afeti doğrulandı',
    'Kurum eklendi', 'Kurum doğrulandı',
    'Afet bildirimi gönderildi', 'Afet bildirimi birleştirildi', 'Afet bildirimi doğrulandı',
    'Operasyon aşaması güncellendi',
    -- 0038
    'Saha güncellemesi yayınlandı', 'Saha güncellemesi düzeltildi', 'Saha güncellemesi sabitlendi'
  ]);
$$;

-- ---------- 16) Realtime — BİLEREK BU DOSYADA DEĞİL --------------------------
-- Tabloyu `supabase_realtime` yayınına eklemek buraya yazılmıştı ve canlıya
-- uygulanırken ÇIKARILDI (01-08-2026). Gerekçe: Realtime `postgres_changes` yükünün
-- sütun bazlı GRANT'e uyup uymadığı henüz ÖLÇÜLMEDİ. Uymuyorsa yayınlanan bir satırın
-- `moderation_reason` ve `author_user_id` alanları abonelere gidebilir.
--
-- Kimse abone olmadığı için bugün bir kazanç yok, ölçülmemiş bir açılım var. Bu adım
-- Faz 4'te, ölçüm yapıldıktan SONRA ayrı bir migration ile eklenecek:
--
--     alter publication supabase_realtime add table operation_updates;
--
-- Ölçüm uymazsa abonelik bu tabloya değil, yalnızca güvenli sütunları taşıyan ayrı bir
-- projeksiyona bağlanacak.

notify pgrst, 'reload schema';
