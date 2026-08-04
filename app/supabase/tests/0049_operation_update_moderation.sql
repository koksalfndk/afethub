-- AfetHUB — Faz 4-A regresyon testleri (migration 0049)
-- =============================================================================
-- Konu: moderasyon yüzeyi. Ölçülenler: kuyruğun iletişim bilgisini MASKELİ
-- döndürmesi, gerekçeli iletişim okumanın denetim kaydı bırakması, yayınlamanın
-- artık doğrulamak SAYILMAMASI, düzenleyerek yayınlamanın özgün metni koruması
-- ve bilgi isteme adımının kaydı yayına itmemesi.
--
-- Çalıştırma:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0049_operation_update_moderation.sql
--
-- Test verisi bir işlem içinde açılır ve SONUNDA GERİ ALINIR.
-- =============================================================================

\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.expect(p_ok boolean, p_what text) returns void
language plpgsql as $$
begin
  if not p_ok then raise exception 'FAIL: %', p_what; end if;
  raise notice 'ok   %', p_what;
end $$;

create or replace function pg_temp.expect_error(p_sql text, p_what text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok   %', p_what;
    return;
  end;
  raise exception 'FAIL: % (hata bekleniyordu, gelmedi)', p_what;
end $$;

create or replace function pg_temp.as_coord(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', p_id), true);
end $$;

create or replace function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;

create temporary table t_ids (k text primary key, v uuid);
create temporary table t_upd (k text primary key, v uuid);

do $$
declare v_dis uuid; v_need uuid; v_loc uuid;
        v_coord uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_coord, 'koordinator49@afethub.test');
  insert into profiles (id, full_name, role) values (v_coord, 'Test Koordinator 49', 'coordinator')
    on conflict (id) do update set role = 'coordinator', full_name = excluded.full_name;

  insert into disasters (name, slug, type, province, region, status)
  values ('Test Operasyonu 0049', 'test-operasyonu-0049', 'Wildfire', 'Muğla', 'Seydikemer', 'Active')
  returning id into v_dis;

  insert into locations (disaster_id, name, address, status)
  values (v_dis, 'Test Teslim Noktası 49', 'Test adres', 'Açık') returning id into v_loc;
  insert into needs (disaster_id, name, category, priority, required_qty, verified_qty, pending_qty, unit, location_name)
  values (v_dis, 'Test Battaniye', 'Barınma', 'Critical', 50, 0, 0, 'adet', 'Test Teslim Noktası 49')
  returning id into v_need;

  insert into t_ids values ('dis', v_dis), ('need', v_need), ('loc', v_loc), ('coord', v_coord);
end $$;

-- Misafir bildirimi: metinde bilerek bir telefon var (PII bayrağı ve düzenleme
-- testleri için).
select pg_temp.as_anon();
do $$
declare v_id uuid;
begin
  v_id := submit_operation_update(
    (select v from t_ids where k='dis'), 'field_report',
    'Kuzey mahallede su dagitimi durdu. Bilgi icin 0532 111 22 33 numarasini arayin.',
    (select v from t_ids where k='need'), (select v from t_ids where k='loc'),
    'Kuzey mahalle', 'Ayse Yilmaz', 'saha49@afethub.test', '05321112233');
  insert into t_upd values ('guest', v_id);
end $$;

-- ---------- 1) Şema: özgün metin ve bilgi isteme alanları --------------------
select pg_temp.expect(
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='operation_updates'
      and column_name in ('original_body','info_requested_at','info_request_message')) = 3,
  'özgün metin ve bilgi isteme sütunları eklendi');
select pg_temp.expect(
  (select original_body is null from operation_updates where id = (select v from t_upd where k='guest')),
  'düzenlenmemiş kaydın özgün metin sütunu boş');

-- ---------- 2) Kuyruk İLETİŞİM BİLGİSİNİ MASKELİ döndürüyor -------------------
-- 0049'un varlık sebebi. Bir gün biri ham sütunu geri koyarsa bu test düşer.
select pg_temp.expect(
  not exists (
    select 1 from information_schema.routines r
     join information_schema.parameters p on p.specific_name = r.specific_name
    where r.routine_schema='public' and r.routine_name='operation_update_queue'
      and p.parameter_name in ('contact_name','contact_email','contact_phone')),
  'kuyruk artık ham iletişim sütunu döndürmüyor');

select pg_temp.as_coord((select v from t_ids where k='coord'));

select pg_temp.expect(
  (select email_masked <> 'saha49@afethub.test' and email_masked <> ''
     from operation_update_queue((select v from t_ids where k='dis'), 50)
    where id = (select v from t_upd where k='guest')),
  'kuyruktaki e-posta maskeli ve boş değil');
select pg_temp.expect(
  (select phone_masked <> '05321112233' and phone_masked <> ''
     from operation_update_queue((select v from t_ids where k='dis'), 50)
    where id = (select v from t_upd where k='guest')),
  'kuyruktaki telefon maskeli');
select pg_temp.expect(
  (select contact_masked <> 'Ayse Yilmaz'
     from operation_update_queue((select v from t_ids where k='dis'), 50)
    where id = (select v from t_upd where k='guest')),
  'kuyruktaki ad maskeli');
select pg_temp.expect(
  (select has_contact
     from operation_update_queue((select v from t_ids where k='dis'), 50)
    where id = (select v from t_upd where k='guest')),
  'iletişim bilgisi bulunduğu ayrıca bildiriliyor');
select pg_temp.expect(
  (select pii_flagged
     from operation_update_queue((select v from t_ids where k='dis'), 50)
    where id = (select v from t_upd where k='guest')),
  'metindeki telefon numarası bayraklanmış');

-- ---------- 3) Kuyruk ve yeni fonksiyonlar anon'a KAPALI ---------------------
select pg_temp.expect(
  not has_function_privilege('anon', 'operation_update_queue(uuid, integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'get_operation_update_contact(uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'publish_operation_update_edited(uuid, text, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'request_operation_update_info(uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'moderate_operation_update(uuid, text, text, boolean)', 'EXECUTE'),
  'moderasyon fonksiyonlarının hiçbiri anon''a açık değil');
select pg_temp.expect(
  has_function_privilege('authenticated', 'get_operation_update_contact(uuid, text)', 'EXECUTE'),
  'iletişim okuma yetkisi authenticated''a verilmiş (yetki kontrolü fonksiyon içinde)');

-- ---------- 4) Gerekçeli iletişim okuma --------------------------------------
select pg_temp.expect_error(
  format('select * from get_operation_update_contact(%L, %L)',
         (select v from t_upd where k='guest'), 'ab'),
  'gerekçesiz iletişim okuma reddediliyor');

select pg_temp.expect(
  (select count(*) from get_operation_update_contact(
     (select v from t_upd where k='guest'),
     'Bildirimdeki su kesintisi teyidi icin geri aranacak')) = 1,
  'gerekçeyle iletişim bilgisi okunabiliyor');
select pg_temp.expect(
  (select email = 'saha49@afethub.test' from get_operation_update_contact(
     (select v from t_upd where k='guest'), 'Teyit icin ikinci okuma')),
  'okunan e-posta TAM değer');
select pg_temp.expect(
  (select count(*) from audit_log
    where action = 'Saha güncellemesi iletişim bilgisi görüntülendi'
      and disaster_id = (select v from t_ids where k='dis')) >= 2,
  'her okuma ayrı bir denetim kaydı bırakıyor');
-- Denetim kaydı gerekçeyi taşıyor ama kişinin e-postasını TAŞIMIYOR.
select pg_temp.expect(
  not exists (
    select 1 from audit_log
     where action = 'Saha güncellemesi iletişim bilgisi görüntülendi'
       and (detail like '%saha49@afethub.test%' or new_value like '%saha49@afethub.test%')),
  'denetim kaydı okunan e-postayı içermiyor');

-- Koordinatör olmayan okuyamıyor.
select pg_temp.as_anon();
select pg_temp.expect_error(
  format('select * from get_operation_update_contact(%L, %L)',
         (select v from t_upd where k='guest'), 'Gecerli bir gerekce metni'),
  'anon iletişim bilgisi okuyamıyor');
select pg_temp.expect_error(
  format('select * from operation_update_queue(%L, 10)', (select v from t_ids where k='dis')),
  'anon moderasyon kuyruğunu okuyamıyor');

-- ---------- 5) Bilgi iste ----------------------------------------------------
select pg_temp.as_coord((select v from t_ids where k='coord'));
select request_operation_update_info(
  (select v from t_upd where k='guest'),
  'Su dagitiminin hangi saatte durdugunu ogrenebilir miyiz?');

select pg_temp.expect(
  (select status::text = 'moderation_pending' and info_requested_at is not null
     from operation_updates where id = (select v from t_upd where k='guest')),
  'bilgi istendiğinde kayıt moderasyonda kalıyor');
select pg_temp.expect(
  (select count(*) from operation_update_events_public
    where update_id = (select v from t_upd where k='guest')) = 0,
  'bilgi isteme HİÇBİR olay üretmiyor');
select pg_temp.expect(
  (select count(*) from operation_updates_public
    where id = (select v from t_upd where k='guest')) = 0,
  'bilgi istenen kayıt herkese açık görünümde YOK');
select pg_temp.expect(
  (select count(*) from audit_log
    where action = 'Saha güncellemesi için ek bilgi istendi') = 1,
  'bilgi isteme denetim kaydı yazıldı');
select pg_temp.expect(
  (select info_requested_at is not null
     from operation_update_queue((select v from t_ids where k='dis'), 50)
    where id = (select v from t_upd where k='guest')),
  'bilgi istendiği kuyrukta görünüyor');
select pg_temp.expect_error(
  format('select request_operation_update_info(%L, %L)', (select v from t_upd where k='guest'), 'ab'),
  'çok kısa bilgi isteme metni reddediliyor');

-- ---------- 6) Düzenleyerek yayınla ------------------------------------------
select pg_temp.expect_error(
  format('select publish_operation_update_edited(%L, %L, %L)',
         (select v from t_upd where k='guest'), 'Kuzey mahallede su dagitimi durdu.', ''),
  'gerekçesiz düzenleyerek yayınlama reddediliyor');
select pg_temp.expect_error(
  format('select publish_operation_update_edited(%L, %L, %L)',
         (select v from t_upd where k='guest'), 'ab', 'Telefon numarasi temizlendi'),
  'çok kısa metinle yayınlama reddediliyor');

select publish_operation_update_edited(
  (select v from t_upd where k='guest'),
  'Kuzey mahallede su dagitimi durdu. Koordinasyon ekibi bolgeye yonlendirildi.',
  'Metindeki kisisel telefon numarasi cikarildi');

select pg_temp.expect(
  (select original_body like '%0532 111 22 33%'
     from operation_updates where id = (select v from t_upd where k='guest')),
  'gönderenin ÖZGÜN metni korunuyor');
select pg_temp.expect(
  (select body not like '%0532%' and status::text = 'published'
     from operation_updates where id = (select v from t_upd where k='guest')),
  'yayımlanan metin düzenlenmiş hâli');
select pg_temp.expect(
  (select not pii_flagged from operation_updates where id = (select v from t_upd where k='guest')),
  'düzenleme sonrası PII bayrağı yeniden hesaplanıyor');
select pg_temp.expect(
  (select info_requested_at is null from operation_updates where id = (select v from t_upd where k='guest')),
  'karar verilince bekleyen bilgi isteği kapanıyor');
select pg_temp.expect(
  (select count(*) from operation_update_events_public
    where update_id = (select v from t_upd where k='guest') and event_type = 'published') = 1,
  'düzenleyerek yayınlama tam olarak bir `published` olayı üretti');
select pg_temp.expect(
  (select count(*) from audit_log
    where action = 'Saha güncellemesi düzenlenerek yayınlandı') = 1,
  'düzenleyerek yayınlama denetim kaydı yazıldı');
-- Denetim kaydı özgün metnin kesitini taşıyor; bu bilinçli (kim neyi değiştirdi).
-- Ama herkese açık akışa düşmüyor:
select pg_temp.expect(
  (select count(*) from audit_log_public
    where action = 'Saha güncellemesi düzenlenerek yayınlandı') = 0,
  'düzenleme kaydı herkese açık akışta YOK');

select pg_temp.expect_error(
  format('select publish_operation_update_edited(%L, %L, %L)',
         (select v from t_upd where k='guest'), 'Yeniden duzenleme denemesi metni.', 'Ikinci duzenleme'),
  'yayımlanmış kayıt "düzenleyerek yayınla" ile ikinci kez yayınlanamıyor');
select pg_temp.expect_error(
  format('select request_operation_update_info(%L, %L)',
         (select v from t_upd where k='guest'), 'Yayimlanmis kayda bilgi istegi'),
  'yayımlanmış kayıt için bilgi istenemiyor');

-- ---------- 7) Yayınlamak DOĞRULAMAK değil ------------------------------------
-- Faz 4-A üretim doğrulamasında çıkan kusur: misafirin yazdığı, kimsenin teyit
-- etmediği bir bildirim "Koordinatör doğruladı" rozetiyle çıkıyordu.
select pg_temp.expect(
  (select verification_status = 'unverified'
     from operation_updates where id = (select v from t_upd where k='guest')),
  'misafir bildirimi yayımlansa bile doğrulanmış SAYILMIYOR');

select pg_temp.as_anon();
do $$
declare v_id uuid;
begin
  v_id := submit_operation_update(
    (select v from t_ids where k='dis'), 'field_report',
    'Guney hattinda yol acildi, arac gecisi mumkun.',
    null, null, 'Guney hatti', 'Mehmet Demir', 'saha49b@afethub.test', '');
  insert into t_upd values ('guest2', v_id);
end $$;

select pg_temp.as_coord((select v from t_ids where k='coord'));
select moderate_operation_update((select v from t_upd where k='guest2'), 'publish', '');
select pg_temp.expect(
  (select status::text = 'published' and verification_status = 'unverified'
     from operation_updates where id = (select v from t_upd where k='guest2')),
  'düz yayınlama misafir bildirimini doğrulanmış yapmıyor');

-- Koordinatör açıkça "doğruladım" diyebiliyor.
select moderate_operation_update((select v from t_upd where k='guest2'), 'publish', 'Sahada teyit edildi', true);
select pg_temp.expect(
  (select verification_status = 'coordinator_verified'
     from operation_updates where id = (select v from t_upd where k='guest2')),
  'koordinatör açık onayla doğrulanmış işaretleyebiliyor');

-- Kurum/koordinatör kaynaklı güncelleme yayımlanınca doğrulanmış sayılıyor.
do $$
declare v_id uuid;
begin
  insert into operation_updates (disaster_id, update_type, status, verification_status,
                                 author_type, author_label, body)
  values ((select v from t_ids where k='dis'), 'coordinator_update', 'moderation_pending',
          'unverified', 'coordinator', 'Koordinasyon Ekibi',
          'Ikinci teslim noktasi bu aksam saat 18:00''de aciliyor.')
  returning id into v_id;
  insert into t_upd values ('coordpend', v_id);
end $$;
select moderate_operation_update((select v from t_upd where k='coordpend'), 'publish', '');
select pg_temp.expect(
  (select verification_status = 'coordinator_verified'
     from operation_updates where id = (select v from t_upd where k='coordpend')),
  'koordinatör kaynaklı güncelleme yayımlanınca doğrulanmış sayılıyor');

-- ---------- 8) Gerekçe korunuyor ---------------------------------------------
select moderate_operation_update((select v from t_upd where k='coordpend'), 'hide', 'Saat bilgisi degisti');
select pg_temp.expect(
  (select moderation_reason = 'Saat bilgisi degisti'
     from operation_updates where id = (select v from t_upd where k='coordpend')),
  'gizleme gerekçesi kaydedildi');
select moderate_operation_update((select v from t_upd where k='coordpend'), 'publish', '');
select pg_temp.expect(
  (select moderation_reason = 'Saat bilgisi degisti'
     from operation_updates where id = (select v from t_upd where k='coordpend')),
  'boş gerekçeli yayınlama eski gerekçeyi SİLMİYOR');
select pg_temp.expect_error(
  format('select moderate_operation_update(%L, %L, %L)',
         (select v from t_upd where k='coordpend'), 'hide', ''),
  'gerekçesiz gizleme reddediliyor');

-- ---------- 9) Gizlenen kayıt veritabanında duruyor ---------------------------
select moderate_operation_update((select v from t_upd where k='guest'), 'hide', 'Test kaydi gizlendi');
select pg_temp.expect(
  (select count(*) from operation_updates where id = (select v from t_upd where k='guest')) = 1,
  'gizlenen kayıt veritabanından SİLİNMİYOR');
select pg_temp.expect(
  (select count(*) from operation_updates_public where id = (select v from t_upd where k='guest')) = 0,
  'gizlenen kayıt herkese açık görünümden düşüyor');
select pg_temp.expect(
  (select count(*) from operation_update_events_public
    where update_id = (select v from t_upd where k='guest') and event_type = 'hidden') = 1,
  'gizleme bir `hidden` olayı üretti');
select pg_temp.expect(
  (select original_body is not null from operation_updates where id = (select v from t_upd where k='guest')),
  'gizlemeden sonra da özgün metin duruyor');

-- ---------- 10) Olay yükü hâlâ içerik taşımıyor -------------------------------
-- 0048'in iddiası 0049 sonrası da geçerli olmalı.
select pg_temp.expect(
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='operation_update_events_public') = 7,
  'olay tablosu 0049 sonrası da yedi sütun');

rollback;
