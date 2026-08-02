-- AfetHUB — Faz 1 regresyon testleri (migration 0036, 0037, 0038)
-- =============================================================================
-- Neden SQL, neden bir test çerçevesi değil: bu depoda henüz test bağımlılığı yok ve
-- burada doğrulanan şeylerin hepsi VERİTABANI kuralları — yetki, RLS, miktar
-- değişmezliği, moderasyon görünürlüğü. Bir tarayıcı testi bunların hiçbirini
-- kanıtlayamaz; yetki tarayıcıda değil (rules/03 §Server-Side Authorization).
--
-- Çalıştırma (temiz bir kabuk veritabanında, şema + tüm migration'lar uygulandıktan
-- sonra):
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0036_0038_operation_detail.sql
--
-- Test verisi bir işlem içinde açılır ve SONUNDA GERİ ALINIR: canlı bir projede
-- çalıştırıldığında geriye hiçbir satır bırakmaz.
-- =============================================================================

\set ON_ERROR_STOP on
begin;

-- ---------- Yardımcılar ------------------------------------------------------
create or replace function pg_temp.expect(p_ok boolean, p_what text) returns void
language plpgsql as $$
begin
  if not p_ok then
    raise exception 'FAIL: %', p_what;
  end if;
  raise notice 'ok   %', p_what;
end $$;

-- Bir ifadenin hata FIRLATMASI bekleniyor.
create or replace function pg_temp.expect_error(p_sql text, p_what text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok   % (reddedildi: %)', p_what, left(sqlerrm, 60);
    return;
  end;
  raise exception 'FAIL: % — beklenen hata oluşmadı', p_what;
end $$;

create or replace function pg_temp.as_user(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
end $$;

-- ---------- Sabit kimlikler --------------------------------------------------
create temporary table t_ids (k text primary key, v uuid);

do $$
declare
  v_coord uuid := gen_random_uuid();
  v_user  uuid := gen_random_uuid();
  v_dis   uuid;
  v_loc   uuid;
  v_need  uuid;
  v_done  uuid;
begin
  insert into auth.users (id, email) values (v_coord, 'coord@test.local'), (v_user, 'user@test.local');
  insert into profiles (id, full_name, role) values
    (v_coord, 'Test Koordinatör', 'coordinator'),
    (v_user,  'Test Kullanıcı',   'volunteer')
  on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

  insert into disasters (slug, name, region, province, status, situation, opened_at)
  values ('test-operasyon-0036', 'Test Operasyonu', 'Test · Türkiye', 'Muğla', 'Active', 'Test.', current_date)
  returning id into v_dis;

  insert into locations (disaster_id, name, address, status)
  values (v_dis, 'Test Teslim Noktası', 'Test adres', 'Açık') returning id into v_loc;

  insert into needs (disaster_id, name, category, priority, required_qty, verified_qty, pending_qty, unit, location_name)
  values (v_dis, 'Ventilli Maske', 'Koruyucu', 'Critical', 100, 20, 0, 'adet', 'Test Teslim Noktası')
  returning id into v_need;

  insert into needs (disaster_id, name, category, priority, required_qty, verified_qty, pending_qty, unit, location_name)
  values (v_dis, 'Tamamlanan Kalem', 'Koruyucu', 'Completed', 10, 10, 0, 'adet', 'Test Teslim Noktası')
  returning id into v_done;

  insert into t_ids values ('coord', v_coord), ('user', v_user), ('disaster', v_dis),
                           ('loc', v_loc), ('need', v_need), ('doneNeed', v_done);
end $$;

-- =============================================================================
-- 1) OPERASYON AŞAMASI
-- =============================================================================
\echo '--- 1) Operasyon aşaması ---'

-- Yetkisiz kullanıcı aşama değiştiremez.
do $$ begin perform pg_temp.as_user((select v from t_ids where k='user')); end $$;
select pg_temp.expect_error(
  format('select set_operation_stage(%L::uuid, %L::operation_stage, %L, %L)',
         (select v from t_ids where k='disaster'), 'cooling', 'Not', 'Sebep'),
  'yetkisiz kullanıcı aşama değiştiremez');

-- Oturumsuz ziyaretçi de değiştiremez.
do $$ begin perform pg_temp.as_user(null); end $$;
select pg_temp.expect_error(
  format('select set_operation_stage(%L::uuid, %L::operation_stage, %L, %L)',
         (select v from t_ids where k='disaster'), 'cooling', '', ''),
  'misafir aşama değiştiremez');

-- Koordinatör değiştirebilir.
do $$ begin perform pg_temp.as_user((select v from t_ids where k='coord')); end $$;
select set_operation_stage((select v from t_ids where k='disaster'), 'cooling',
  'Aktif alevler kontrol altında. Ekipler soğutma yapıyor.', 'Ekip raporu');

select pg_temp.expect(
  (select operation_stage = 'cooling' and operation_stage_note <> '' and operation_stage_set_at is not null
     from disasters where id = (select v from t_ids where k='disaster')),
  'koordinatör aşamayı yazabilir');

-- Denetim kaydı oluştu ve herkese açık akışta görünür.
select pg_temp.expect(
  (select count(*) = 1 from audit_log
    where disaster_id = (select v from t_ids where k='disaster')
      and action = 'Operasyon aşaması güncellendi'),
  'aşama değişikliği denetim kaydı oluşturur');
select pg_temp.expect(audit_is_public('Operasyon aşaması güncellendi'),
  'aşama değişikliği herkese açık akışta görünür');

-- Görünüm aşamayı taşıyor (0035 sütunları bozulmadan).
select pg_temp.expect(
  (select operation_stage::text = 'cooling' and required_total = 110 and verified_total = 30
     from disaster_overview where id = (select v from t_ids where k='disaster')),
  'disaster_overview aşamayı ve mevcut miktar sütunlarını birlikte veriyor');

-- Açıklama aşamasız yazılamaz.
select pg_temp.expect_error(
  format('select set_operation_stage(%L::uuid, null, %L, %L)',
         (select v from t_ids where k='disaster'), 'aşamasız açıklama', ''),
  'aşama olmadan açıklama yazılamaz');

-- Öne çıkan ihtiyaçlar.
select set_featured_needs((select v from t_ids where k='disaster'),
  array[(select v from t_ids where k='need')]::uuid[]);
select pg_temp.expect(
  (select featured_rank = 1 from needs where id = (select v from t_ids where k='need')),
  'koordinatör ihtiyacı öne çıkarabilir');
select pg_temp.expect_error(
  format('select set_featured_needs(%L::uuid, array[%L,%L,%L,%L,%L]::uuid[])',
         (select v from t_ids where k='disaster'),
         gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()),
  'dörtten fazla ihtiyaç öne çıkarılamaz');

-- =============================================================================
-- 2) TESLİM SÖZÜ
-- =============================================================================
\echo '--- 2) Teslim sözü ---'

create temporary table t_before as
select required_qty, verified_qty, pending_qty, remaining_qty
  from needs where id = (select v from t_ids where k='need');

do $$ begin perform pg_temp.as_user(null); end $$;   -- misafir
create temporary table t_code (code text);
insert into t_code
select create_delivery_pledge(
  (select v from t_ids where k='need'), 30, 'adet',
  (select v from t_ids where k='loc'), now() + interval '2 days',
  'Test Bağışçı', 'bagisci@test.local', '', 'Muğla', 'Yarın getireceğim');

select pg_temp.expect((select count(*) = 1 from t_code where code like 'SOZ-%'),
  'misafir hesapsız teslim sözü verebilir ve takip kodu alır');

-- ÇEKİRDEK DEĞİŞMEZ: söz hiçbir miktarı değiştirmez.
select pg_temp.expect(
  (select n.required_qty = b.required_qty and n.verified_qty = b.verified_qty
      and n.pending_qty = b.pending_qty and n.remaining_qty = b.remaining_qty
     from needs n, t_before b where n.id = (select v from t_ids where k='need')),
  'teslim sözü required/verified/pending/remaining miktarlarının HİÇBİRİNİ değiştirmez');

select pg_temp.expect(
  (select pledged_qty = 30 from need_pledge_totals where need_id = (select v from t_ids where k='need')),
  'söz ayrı bir bilgilendirme toplamı olarak görünür');

-- Aynı gönderi tekrarı ikinci kayıt üretmez.
select pg_temp.expect(
  (select create_delivery_pledge(
     (select v from t_ids where k='need'), 30, 'adet',
     (select v from t_ids where k='loc'), now() + interval '2 days',
     'Test Bağışçı', 'bagisci@test.local', '', 'Muğla', 'Yarın getireceğim')
   = (select code from t_code)),
  'ağ tekrarı ikinci bir söz üretmez (idempotency)');

-- Kapalı kalem yardım kabul etmez.
select pg_temp.expect_error(
  format('select create_delivery_pledge(%L::uuid, 5, null, null, null, %L, %L, %L, %L, %L)',
         (select v from t_ids where k='doneNeed'), 'X Y', 'x@test.local', '', '', ''),
  'tamamlanmış kaleme teslim sözü verilemez');

-- Miktar aralığı.
select pg_temp.expect_error(
  format('select create_delivery_pledge(%L::uuid, 0, null, null, null, %L, %L, %L, %L, %L)',
         (select v from t_ids where k='need'), 'X Y', 'x@test.local', '', '', ''),
  'sıfır miktarlı söz reddedilir');

-- Takip: kod tek başına yetmez.
select pg_temp.expect(
  (select count(*) = 0 from track_delivery_pledge((select code from t_code), 'baskasi@test.local')),
  'takip kodu yanlış e-posta ile kayıt döndürmez');
select pg_temp.expect(
  (select count(*) = 1 from track_delivery_pledge((select code from t_code), 'BAGISCI@test.local')),
  'takip kodu + doğru e-posta kaydı döndürür');

-- Tablo herkese açık okunmaz: anon rolünde hiçbir sütun yetkisi yok, dolayısıyla
-- sorgu RLS'e bile ulaşmadan reddedilir.
set local role anon;
select pg_temp.expect_error('select count(*) from delivery_pledges',
  'anon delivery_pledges tablosunu sorgulayamaz');
reset role;

-- İptal miktarları etkilemez ve toplamdan düşer.
select pg_temp.expect(
  cancel_delivery_pledge((select code from t_code), 'bagisci@test.local', 'Aracım bozuldu') = 'cancelled',
  'kullanıcı sözünü iptal edebilir');
select pg_temp.expect(
  (select count(*) = 0 from need_pledge_totals where need_id = (select v from t_ids where k='need')),
  'iptal edilen söz canlı toplamdan düşer');
select pg_temp.expect(
  (select n.verified_qty = b.verified_qty and n.remaining_qty = b.remaining_qty
     from needs n, t_before b where n.id = (select v from t_ids where k='need')),
  'iptal ihtiyaç miktarını etkilemez');

-- Süresi geçen söz expired olur (koordinatör yetkisiyle).
do $$
declare v_c text;
begin
  perform pg_temp.as_user(null);
  v_c := create_delivery_pledge((select v from t_ids where k='need'), 5, 'adet', null,
           now() + interval '1 hour', 'Gecikmis Kisi', 'gec@test.local', '', '', '');
  -- Tarihi geriye alıyoruz: `create_delivery_pledge` geçmişe söz kabul etmiyor.
  update delivery_pledges set estimated_delivery_at = now() - interval '10 days'
   where public_tracking_code = v_c;
end $$;
do $$ begin perform pg_temp.as_user((select v from t_ids where k='coord')); end $$;
select pg_temp.expect(expire_stale_pledges(48) = 1, 'süresi geçen söz expired olur');

do $$ begin perform pg_temp.as_user((select v from t_ids where k='user')); end $$;
select pg_temp.expect_error('select expire_stale_pledges(48)',
  'yetkisiz kullanıcı sözleri expire edemez');
select pg_temp.expect_error(
  format('select set_pledge_status(%L::uuid, %L::pledge_status, %L)',
         (select id from delivery_pledges limit 1), 'confirmed', ''),
  'yetkisiz kullanıcı söz durumunu değiştiremez');

do $$ begin perform pg_temp.as_user((select v from t_ids where k='coord')); end $$;
select pg_temp.expect_error(
  format('select set_pledge_status(%L::uuid, %L::pledge_status, %L)',
         (select id from delivery_pledges limit 1), 'fulfilled', ''),
  'koordinatör bir sözü elle "fulfilled" yapamaz');

-- =============================================================================
-- 3) SAHA GÜNCELLEMELERİ
-- =============================================================================
\echo '--- 3) Saha güncellemeleri ---'

create temporary table t_upd (k text primary key, v uuid);

-- Misafir gönderisi moderasyona düşer.
do $$ begin perform pg_temp.as_user(null); end $$;
insert into t_upd
select 'guest', submit_operation_update(
  (select v from t_ids where k='disaster'), 'field_report',
  'Yesiluzumlu cevresinde gonullu yonlendirmesi devam ediyor.',
  null, null, 'Yesiluzumlu cevresi', 'Misafir Kisi', 'misafir@test.local', '');

select pg_temp.expect(
  (select status = 'moderation_pending' and author_label = 'Misafir'
     from operation_updates where id = (select v from t_upd where k='guest')),
  'misafir gönderisi doğrudan yayınlanmaz, moderasyona düşer');
select pg_temp.expect(
  (select count(*) = 0 from operation_updates_public where id = (select v from t_upd where k='guest')),
  'moderasyon bekleyen gönderi herkese açık akışta görünmez');

-- Misafir e-postasız gönderemez.
select pg_temp.expect_error(
  format('select submit_operation_update(%L::uuid, %L::operation_update_type, %L, null, null, %L, %L, %L, %L)',
         (select v from t_ids where k='disaster'), 'field_report',
         'E-postasiz saha bildirimi denemesi', '', 'Ad Soyad', '', ''),
  'misafir e-posta olmadan saha bildirimi gönderemez');

-- Misafir koordinatör türü gönderemez.
select pg_temp.expect_error(
  format('select submit_operation_update(%L::uuid, %L::operation_update_type, %L, null, null, %L, %L, %L, %L)',
         (select v from t_ids where k='disaster'), 'safety_notice',
         'Sahte guvenlik uyarisi denemesi', '', 'Ad Soyad', 'm2@test.local', ''),
  'misafir güvenlik uyarısı yayınlayamaz');

-- Telefon numarası içeren metin bayraklanır ve yayına çıkmaz.
do $$ begin perform pg_temp.as_user(null); end $$;
insert into t_upd
select 'pii', submit_operation_update(
  (select v from t_ids where k='disaster'), 'field_report',
  'Bana ulasin 0532 111 22 33 numarasindan yardim gonderebilirsiniz.',
  null, null, '', 'Pii Kisi', 'pii@test.local', '');
select pg_temp.expect(
  (select pii_flagged and status = 'moderation_pending'
     from operation_updates where id = (select v from t_upd where k='pii')),
  'iletişim bilgisi içeren metin bayraklanır ve yayına çıkmaz');

-- Koordinatör doğrudan yayınlar.
do $$ begin perform pg_temp.as_user((select v from t_ids where k='coord')); end $$;
insert into t_upd
select 'coord', submit_operation_update(
  (select v from t_ids where k='disaster'), 'coordinator_update',
  'Sogutma calismalari kuzey hattinda devam ediyor.',
  (select v from t_ids where k='need'), (select v from t_ids where k='loc'), 'Kuzey hatti', '', '', '');

select pg_temp.expect(
  (select status = 'published' and verification_status = 'coordinator_verified'
     from operation_updates where id = (select v from t_upd where k='coord')),
  'koordinatör güncellemesi doğrudan yayınlanır ve doğrulanmış işaretlenir');
select pg_temp.expect(
  (select related_need_name = 'Ventilli Maske' and related_location_name = 'Test Teslim Noktası'
     from operation_updates_public where id = (select v from t_upd where k='coord')),
  'yayınlanan güncelleme ilgili ihtiyaç ve teslim noktasıyla birlikte görünür');

-- Herkese açık görünüm KİŞİSEL VERİ taşımıyor.
select pg_temp.expect(
  (select count(*) = 0
     from information_schema.columns
    where table_name = 'operation_updates_public'
      and column_name in ('author_user_id','moderated_by','moderation_reason','pii_flagged','contact_email')),
  'herkese açık görünümde yazar kimliği / moderasyon alanları yok');

-- anon rolü kapalı sütunları okuyamaz, açık sütunları okuyabilir.
set local role anon;
select pg_temp.expect_error('select author_user_id from operation_updates limit 1',
  'anon author_user_id sütununu okuyamaz');
select pg_temp.expect_error('select moderation_reason from operation_updates limit 1',
  'anon moderation_reason sütununu okuyamaz');
select pg_temp.expect_error('select * from operation_update_contacts limit 1',
  'anon gönderen iletişim tablosunu okuyamaz');
select pg_temp.expect((select count(*) = 1 from operation_updates),
  'anon yalnızca yayınlanmış satırı görür (RLS)');
reset role;

-- Moderasyon: yayınla → akışta görünür.
do $$ begin perform pg_temp.as_user((select v from t_ids where k='coord')); end $$;
select moderate_operation_update((select v from t_upd where k='guest'), 'publish', '');
select pg_temp.expect(
  (select count(*) = 1 from operation_updates_public where id = (select v from t_upd where k='guest')),
  'yayınlanan gönderi herkese açık akışa girer');

-- Gizle → akıştan çıkar, kayıt durur.
select moderate_operation_update((select v from t_upd where k='guest'), 'hide', 'Doğrulanamadı');
select pg_temp.expect(
  (select count(*) = 0 from operation_updates_public where id = (select v from t_upd where k='guest')),
  'gizlenen gönderi herkese açık akıştan çıkar');
select pg_temp.expect(
  (select count(*) = 1 from operation_updates where id = (select v from t_upd where k='guest')),
  'gizlenen gönderinin kaydı silinmez');

-- Yetkisiz moderasyon reddedilir.
do $$ begin perform pg_temp.as_user((select v from t_ids where k='user')); end $$;
select pg_temp.expect_error(
  format('select moderate_operation_update(%L::uuid, %L, %L)',
         (select v from t_upd where k='pii'), 'publish', ''),
  'yetkisiz kullanıcı moderasyon yapamaz');
select pg_temp.expect_error('select * from operation_update_queue(null, 10)',
  'yetkisiz kullanıcı moderasyon kuyruğunu okuyamaz');

do $$ begin perform pg_temp.as_user((select v from t_ids where k='coord')); end $$;
select pg_temp.expect((select count(*) >= 1 from operation_update_queue(null, 50)),
  'koordinatör moderasyon kuyruğunu okuyabilir');

-- Sabitleme sınırı.
select pin_operation_update((select v from t_upd where k='coord'), true, now() + interval '1 day');
select pg_temp.expect(
  (select is_pinned from operation_updates_public where id = (select v from t_upd where k='coord')),
  'sabitlenen mesaj akışta sabit görünür');
select pg_temp.expect_error(
  format('select pin_operation_update(%L::uuid, true, null)', (select v from t_upd where k='guest')),
  'yayınlanmamış bir gönderi sabitlenemez');

-- Süresi dolan sabit, sabit değildir.
update operation_updates set pinned_until = now() - interval '1 hour'
 where id = (select v from t_upd where k='coord');
select pg_temp.expect(
  (select not is_pinned from operation_updates_public where id = (select v from t_upd where k='coord')),
  'süresi dolan sabitleme kendiliğinden düşer');

-- Yanlış bilgi düzeltme.
insert into t_upd
select 'fix', correct_operation_update((select v from t_upd where k='coord'),
  'Duzeltme: sogutma calismalari GUNEY hattinda devam ediyor.', 'Hat adı yanlıştı');
select pg_temp.expect(
  (select status = 'corrected' from operation_updates where id = (select v from t_upd where k='coord')),
  'düzeltilen orijinal kayıt "corrected" olarak işaretlenir');
select pg_temp.expect(
  (select corrects_update_id = (select v from t_upd where k='coord')
     from operation_updates_public where id = (select v from t_upd where k='fix')),
  'düzeltme kaydı orijinali işaret eder');
select pg_temp.expect(
  (select count(*) = 1 from audit_log
    where action = 'Saha güncellemesi düzeltildi'
      and disaster_id = (select v from t_ids where k='disaster')),
  'düzeltme denetim kaydına eski ve yeni metinle yazılır');

-- Raporlama: yalnızca yayınlanmış içerik.
do $$ begin perform pg_temp.as_user((select v from t_ids where k='user')); end $$;
select pg_temp.expect_error(
  format('select report_operation_update(%L::uuid, %L, %L)',
         (select v from t_upd where k='pii'), 'spam', ''),
  'moderasyondaki içerik raporlanamaz (kuyruğun varlığı sızmaz)');
select report_operation_update((select v from t_upd where k='fix'), 'wrong_info', 'Kuzey hatti dogruydu');
select pg_temp.expect(
  (select count(*) = 1 from operation_update_reports where operation_update_id = (select v from t_upd where k='fix')),
  'kullanıcı yayınlanmış bir güncellemeyi raporlayabilir');
select report_operation_update((select v from t_upd where k='fix'), 'spam', '');
select pg_temp.expect(
  (select count(*) = 1 from operation_update_reports where operation_update_id = (select v from t_upd where k='fix')),
  'aynı kullanıcı aynı gönderiyi ikinci kez raporlayamaz');

-- =============================================================================
-- 4) FOTOĞRAF
-- =============================================================================
\echo '--- 4) Fotoğraf ---'

do $$ begin perform pg_temp.as_user((select v from t_ids where k='coord')); end $$;

-- Geçersiz tür ve büyük dosya reddedilir.
select pg_temp.expect_error(
  format('select register_update_attachment(%L::uuid, %L, %L, 1000)',
         (select v from t_upd where k='fix'),
         (select v from t_ids where k='disaster')::text || '/' || (select v from t_upd where k='fix')::text || '/a.gif',
         'image/gif'),
  'desteklenmeyen dosya türü reddedilir');
select pg_temp.expect_error(
  format('select register_update_attachment(%L::uuid, %L, %L, 20000000)',
         (select v from t_upd where k='fix'),
         (select v from t_ids where k='disaster')::text || '/' || (select v from t_upd where k='fix')::text || '/b.webp',
         'image/webp'),
  'boyut sınırını aşan dosya reddedilir');

-- Yanlış klasör reddedilir.
select pg_temp.expect_error(
  format('select register_update_attachment(%L::uuid, %L, %L, 1000)',
         (select v from t_upd where k='fix'), 'baska-klasor/c.webp', 'image/webp'),
  'başka bir klasöre yazılmış nesne kaydedilemez');

-- Koordinatör eki doğrudan onaylı ve galeriye düşer.
create temporary table t_att (k text primary key, v uuid);
insert into t_att
select 'ok', register_update_attachment(
  (select v from t_upd where k='fix'),
  (select v from t_ids where k='disaster')::text || '/' || (select v from t_upd where k='fix')::text || '/foto.webp',
  'image/webp', 240000, 1600, 1200, 'Kuzey hattı soğutma', now(), 'Kuzey hattı');

select pg_temp.expect(
  (select moderation_status = 'approved' from operation_update_attachments where id = (select v from t_att where k='ok')),
  'koordinatörün yüklediği fotoğraf onaylı kaydedilir');
select pg_temp.expect(
  (select count(*) = 1 from operation_media_public where id = (select v from t_att where k='ok')),
  'onaylı fotoğraf herkese açık galeride görünür');

-- Onaysız fotoğraf galeride görünmez ve yolu anon'a sızmaz.
select moderate_update_attachment((select v from t_att where k='ok'), 'pending', 'Yeniden bakılacak');
select pg_temp.expect(
  (select count(*) = 0 from operation_media_public where id = (select v from t_att where k='ok')),
  'onayı geri alınan fotoğraf galeriden çıkar');
set local role anon;
select pg_temp.expect((select count(*) = 0 from operation_update_attachments),
  'anon onaysız ekin satırını (ve yolunu) göremez');
reset role;

-- =============================================================================
-- 5) GİZLİLİK
-- =============================================================================
\echo '--- 5) Gizlilik ---'

set local role anon;
select pg_temp.expect_error('select contact_email from delivery_pledges limit 1',
  'anon teslim sözü e-postasını okuyamaz');
select pg_temp.expect((select count(*) = 0 from need_pledge_totals where pledged_qty is null),
  'herkese açık söz toplamı yalnızca sayı taşır');
reset role;

select pg_temp.expect(
  (select count(*) = 0 from audit_log
    where detail ilike '%bagisci@test.local%' or detail ilike '%misafir@test.local%'
       or new_value ilike '%@test.local%' or actor ilike '%@test.local%'),
  'denetim kayıtlarında e-posta adresi tutulmaz');

select pg_temp.expect(
  (select count(*) = 0 from audit_log
    where action in ('Teslim sözü verildi','Teslim sözü iptal edildi','Teslim sözü durumu güncellendi',
                     'Saha güncellemesi moderasyonu','Saha fotoğrafı moderasyonu')
      and audit_is_public(action)),
  'teslim sözü ve moderasyon kayıtları herkese açık akışa düşmez');

\echo '=== TÜM TESTLER GEÇTİ ==='
rollback;
