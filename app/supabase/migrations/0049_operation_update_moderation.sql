-- 0049 — Saha güncellemeleri moderasyonu: gizlilik düzeltmesi ve eksik yollar (Faz 4-A)
--
-- NEDEN BU MIGRATION VAR
-- ----------------------
-- Moderasyon arayüzü yazılmadan önce sunucu yüzeyi okundu ve üç boşluk çıktı.
-- İkisi eksik yol, biri gerçek bir gizlilik kusuru:
--
--   1. `operation_update_queue` LİSTE satırında `contact_name`, `contact_email`
--      ve `contact_phone` alanlarını HAM döndürüyordu. rules/03 §Contact
--      Information liste görünümlerinde tam iletişim bilgisini yasaklıyor ve
--      teslim sözlerinde doğrusu zaten uygulanmıştı: maskeli liste +
--      `get_delivery_pledge_contact(p_pledge, p_purpose)` ile gerekçeli,
--      denetim kaydı bırakan ayrı bir okuma. Saha güncellemelerinde o ayrı
--      okuma hiç yoktu, dolayısıyla kuyruğu açan her koordinatör ekranda
--      onlarca kişinin telefonunu ve e-postasını gerekçesiz görüyordu.
--
--   2. "Düzenleyerek yayınla" yolu yoktu. `moderate_operation_update` yalnızca
--      publish/reject/hide/archive kabul ediyor; metne dokunmadan yayınlamak ya
--      da hiç yayınlamamak dışında seçenek yoktu. Koordinatör bir cümledeki ev
--      adresini temizleyip yayınlayamıyordu.
--
--   3. "Bilgi iste" yolu yoktu. Eksik bir bildirimi reddetmek ile olduğu gibi
--      yayınlamak arasında ara adım bulunmuyordu.
--
-- Ayrıca yayınlamanın DOĞRULAMAK sayılması düzeltiliyor (aşağıda §4).
--
-- YENİ TABLO KURULMUYOR. Üç sütun ekleniyor, iki fonksiyon yazılıyor, iki
-- fonksiyon yeniden tanımlanıyor.

-- ---------------------------------------------------------------------------
-- 1) Şema
-- ---------------------------------------------------------------------------
-- `original_body`: koordinatör metni düzenleyerek yayınladığında gönderenin
-- KENDİ cümlesi kaybolmuyor. rules/02 §Need Requests aynı ilkeyi talep
-- kayıtları için koyuyor ("Preserve the original request even if a coordinator
-- edits the published Need"); saha güncellemesi de bir kişinin ifadesi.
-- Yalnızca İLK düzenlemede doldurulur, sonraki düzenlemeler onu ezmez.
--
-- `info_requested_at` / `info_request_message`: bilgi isteme durumu AYRI bir
-- enum değeri değil. Kayıt hâlâ `moderation_pending` — beklediği şey değişmedi,
-- yalnızca koordinatörün bir sorusu var. Enum'a değer eklemek migration'ı ikiye
-- bölerdi (`alter type ... add value` aynı işlem içinde kullanılamaz) ve durumu
-- yanlış modellerdi.
alter table operation_updates
  add column if not exists original_body        text,
  add column if not exists info_requested_at    timestamptz,
  add column if not exists info_request_message text;

comment on column operation_updates.original_body is
  'Koordinatör düzenleyerek yayınladığında gönderenin özgün metni. İlk düzenlemede dolar, sonra değişmez.';
comment on column operation_updates.info_requested_at is
  'Koordinatör ek bilgi istediğinde dolar. Durum moderation_pending kalır; karar verilince temizlenir.';

-- ---------------------------------------------------------------------------
-- 2) Moderasyon kuyruğu — İLETİŞİM BİLGİSİ MASKELİ
-- ---------------------------------------------------------------------------
-- Dönüş tipi değiştiği için önce düşürülüyor.
drop function if exists operation_update_queue(uuid, integer);

create function operation_update_queue(p_disaster uuid default null, p_limit integer default 100)
returns table (
  id uuid, disaster_id uuid, disaster_name text,
  update_type operation_update_type, status operation_update_status,
  verification_status text, author_type text, author_label text,
  body text, original_body text, approximate_location text, pii_flagged boolean,
  related_need_name text, related_location_name text,
  contact_masked text, email_masked text, phone_masked text, has_contact boolean,
  info_requested_at timestamptz, info_request_message text,
  photo_pending integer, photo_approved integer, open_reports integer,
  created_at timestamptz, published_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_coordinator() then
    raise exception 'not authorized';
  end if;
  return query
    select u.id, u.disaster_id, d.name, u.update_type, u.status,
           u.verification_status, u.author_type, u.author_label,
           u.body, u.original_body, u.approximate_location, u.pii_flagged,
           coalesce(n.name, ''), coalesce(l.name, ''),
           -- Maskeleme sunucuda. İstemciye tam değer HİÇ gitmiyor; "arayüzde
           -- gizlemek" yeterli olsaydı ağ sekmesi onu geri verirdi
           -- (rules/05 §Public and Private Views).
           coalesce(mask_person(c.name), ''),
           coalesce(mask_email(c.email), ''),
           coalesce(mask_phone(c.phone), ''),
           (c.operation_update_id is not null),
           u.info_requested_at, coalesce(u.info_request_message, ''),
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

-- ---------------------------------------------------------------------------
-- 3) Gerekçeli iletişim okuma
-- ---------------------------------------------------------------------------
-- `get_delivery_pledge_contact` ile birebir aynı sözleşme: koordinatör olacak,
-- gerekçe yazacak, okuma denetim kaydına düşecek. Denetim satırı gövdeyi değil
-- kaydın kısa bir kesitini taşıyor — audit_log herkese açık bir yüzeyden
-- okunabiliyor (0045).
create or replace function get_operation_update_contact(p_update uuid, p_purpose text)
returns table (full_name text, email text, phone text)
language plpgsql security definer set search_path = public as $$
declare
  u          operation_updates;
  actor_name text;
  reason     text := btrim(coalesce(p_purpose, ''));
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can read update contact details';
  end if;
  if length(reason) < 3 then
    raise exception 'Kullanım amacı gerekli';
  end if;

  select * into u from operation_updates where operation_updates.id = p_update;
  if not found then raise exception 'Update not found'; end if;

  select coalesce(pr.full_name, 'Koordinatör') into actor_name from profiles pr where pr.id = auth.uid();

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (u.disaster_id, actor_name, 'Saha güncellemesi iletişim bilgisi görüntülendi',
          left(u.body, 80), '—', left(reason, 200), '#8A94A6');

  return query
    select coalesce(c.name, ''), coalesce(c.email, ''), coalesce(c.phone, '')
      from operation_update_contacts c
     where c.operation_update_id = u.id;
end $$;

revoke all on function get_operation_update_contact(uuid, text) from public, anon;
grant execute on function get_operation_update_contact(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Moderasyon — yayınlamak artık DOĞRULAMAK değil
-- ---------------------------------------------------------------------------
-- Eski hâlinde her `publish` kaydı `coordinator_verified` yapıyordu. Misafirin
-- yazdığı, kimsenin sahada teyit etmediği bir bildirim de bu rozetle çıkıyordu.
-- rules/07 §Critical Distinctions tam olarak bunu yasaklıyor: doğrulanmamış bir
-- kullanıcı bildirimi doğrulanmış gibi sunulamaz.
--
-- Yeni kural:
--   * Koordinatör ya da kurum kaynaklı güncelleme yayımlanınca doğrulanmış sayılır
--     (kaynağın kendisi kurumsal).
--   * Misafir/kullanıcı bildirimi yayımlansa bile `unverified` kalır.
--   * `p_verified` açıkça verilirse kararı o belirler — koordinatör "bunu ayrıca
--     doğruladım" diyebilir ya da kendi güncellemesinin doğrulanmamış görünmesini
--     seçebilir.
drop function if exists moderate_operation_update(uuid, text, text);

create function moderate_operation_update(
  p_update   uuid,
  p_action   text,
  p_reason   text default '',
  p_verified boolean default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  u          operation_updates;
  actor_name text;
  v_new      operation_update_status;
  v_ver      text;
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

  select * into u from operation_updates where operation_updates.id = p_update for update;
  if not found then raise exception 'Update not found'; end if;

  v_new := case p_action
             when 'publish' then 'published'
             when 'reject'  then 'rejected'
             when 'hide'    then 'hidden'
             else 'archived' end::operation_update_status;

  v_ver := case
             when v_new <> 'published' then u.verification_status
             when p_verified is true   then 'coordinator_verified'
             when p_verified is false  then 'unverified'
             when u.author_type in ('coordinator', 'institution') then 'coordinator_verified'
             else u.verification_status
           end;

  select coalesce(full_name, 'Koordinatör') into actor_name from profiles where id = auth.uid();

  update operation_updates set
    status              = v_new,
    published_at        = case when v_new = 'published' then coalesce(published_at, now()) else published_at end,
    is_pinned           = case when v_new = 'published' then is_pinned else false end,
    verification_status = v_ver,
    -- Karar verildi: bekleyen bilgi isteği kapanır.
    info_requested_at   = null,
    moderated_by        = auth.uid(),
    moderated_at        = now(),
    -- Boş gerekçe eskisini SİLMİYOR: yayınlarken gerekçe zorunlu değil ve
    -- reddetme gerekçesinin üstüne boş dize yazmak kaydı yoksullaştırırdı.
    moderation_reason   = coalesce(nullif(left(btrim(coalesce(p_reason, '')), 500), ''), moderation_reason),
    updated_at          = now()
  where operation_updates.id = u.id;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (
    u.disaster_id, actor_name,
    case when p_action = 'publish' then 'Saha güncellemesi yayınlandı' else 'Saha güncellemesi moderasyonu' end,
    left(u.body, 120), u.status::text, v_new::text,
    case p_action when 'publish' then '#159947' when 'reject' then '#D9363E' else '#E6A700' end
  );
end $$;

revoke all on function moderate_operation_update(uuid, text, text, boolean) from public, anon;
grant execute on function moderate_operation_update(uuid, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Düzenleyerek yayınla
-- ---------------------------------------------------------------------------
-- `correct_operation_update` ile karıştırılmamalı: o, YAYIMLANMIŞ bir kaydı
-- düzeltir ve yeni bir satır açar (eski satır kalır, herkes düzeltmeyi görür).
-- Bu ise henüz yayımlanmamış bir kaydı düzelterek yayınlar — ortada kamuya
-- gitmiş bir bilgi yok, dolayısıyla ayrı bir düzeltme kaydı da yok. Özgün metin
-- `original_body` içinde durur.
create or replace function publish_operation_update_edited(
  p_update uuid,
  p_body   text,
  p_reason text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  u          operation_updates;
  actor_name text;
  v_body     text := btrim(coalesce(p_body, ''));
  v_reason   text := btrim(coalesce(p_reason, ''));
  v_ver      text;
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can moderate updates';
  end if;
  if length(v_body) < 3 or length(v_body) > 1200 then
    raise exception 'Update text must be between 3 and 1200 characters';
  end if;
  -- Başkasının cümlesini değiştirmek gerekçesiz yapılmaz.
  if length(v_reason) < 3 then
    raise exception 'A reason is required';
  end if;

  select * into u from operation_updates where operation_updates.id = p_update for update;
  if not found then raise exception 'Update not found'; end if;
  if u.status not in ('moderation_pending', 'draft') then
    raise exception 'Only a pending update can be published with edits';
  end if;

  v_ver := case when u.author_type in ('coordinator', 'institution')
                then 'coordinator_verified' else u.verification_status end;

  select coalesce(full_name, 'Koordinatör') into actor_name from profiles where id = auth.uid();

  update operation_updates set
    -- coalesce: ikinci bir düzenleme özgün metni EZMİYOR.
    original_body       = coalesce(original_body, u.body),
    body                = v_body,
    -- Koordinatör metinden telefon/e-posta temizlemiş olabilir; bayrak yeniden hesaplanıyor.
    pii_flagged         = operation_update_pii_flag(v_body),
    status              = 'published',
    published_at        = coalesce(published_at, now()),
    verification_status = v_ver,
    info_requested_at   = null,
    moderated_by        = auth.uid(),
    moderated_at        = now(),
    moderation_reason   = left(v_reason, 500),
    updated_at          = now()
  where operation_updates.id = u.id;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (u.disaster_id, actor_name, 'Saha güncellemesi düzenlenerek yayınlandı',
          left(v_reason, 120), left(u.body, 80), left(v_body, 80), '#159947');
end $$;

revoke all on function publish_operation_update_edited(uuid, text, text) from public, anon;
grant execute on function publish_operation_update_edited(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Bilgi iste
-- ---------------------------------------------------------------------------
-- Kayıt `moderation_pending` KALIYOR. Bu fonksiyon e-posta GÖNDERMİYOR —
-- bildirim motoru Faz 4-B. Arayüz bunu açıkça söylüyor; koordinatör kişiye
-- kendisi ulaşıyor. Otomatik bir bildirim gittiği izlenimi vermek, gönderenin
-- boşuna beklemesine yol açardı.
create or replace function request_operation_update_info(p_update uuid, p_message text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  u          operation_updates;
  actor_name text;
  v_msg      text := btrim(coalesce(p_message, ''));
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can moderate updates';
  end if;
  if length(v_msg) < 3 or length(v_msg) > 500 then
    raise exception 'The information request must be between 3 and 500 characters';
  end if;

  select * into u from operation_updates where operation_updates.id = p_update for update;
  if not found then raise exception 'Update not found'; end if;
  if u.status <> 'moderation_pending' then
    raise exception 'Information can only be requested for a pending update';
  end if;

  select coalesce(full_name, 'Koordinatör') into actor_name from profiles where id = auth.uid();

  update operation_updates set
    info_requested_at    = now(),
    info_request_message = v_msg,
    updated_at           = now()
  where operation_updates.id = u.id;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (u.disaster_id, actor_name, 'Saha güncellemesi için ek bilgi istendi',
          left(u.body, 80), '—', left(v_msg, 200), '#E6A700');
end $$;

revoke all on function request_operation_update_info(uuid, text) from public, anon;
grant execute on function request_operation_update_info(uuid, text) to authenticated;
