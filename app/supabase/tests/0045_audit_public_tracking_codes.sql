-- AfetHUB — Faz 3-C güvenlik testleri (migration 0045)
-- =============================================================================
-- Soru tek: herkese açık denetim akışında takip kodu kalıyor mu?
-- Çalıştırma:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0045_audit_public_tracking_codes.sql
-- Test verisi işlem içinde açılır ve SONUNDA GERİ ALINIR.
-- =============================================================================

\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.expect(p_ok boolean, p_what text) returns void
language plpgsql as $$
begin
  if not p_ok then raise exception 'FAIL: %', p_what; end if;
  raise notice 'ok   %', p_what;
end $$;

-- ---------- Kod tanıma ------------------------------------------------------
select pg_temp.expect(looks_like_tracking_code('AFT-4821'), 'AFT- kodu tanınıyor');
select pg_temp.expect(looks_like_tracking_code('SOZ-B2JP3G'), 'SOZ- kodu tanınıyor');
select pg_temp.expect(looks_like_tracking_code('NRQ-118'), 'NRQ- kodu tanınıyor');
-- Bugün var olmayan bir önek de kapsanıyor: kural biçime değil, ŞEKLE bakıyor.
select pg_temp.expect(looks_like_tracking_code('XYZW-9Q7K2'), 'gelecekteki bir önek de tanınıyor');
select pg_temp.expect(not looks_like_tracking_code('30 kutu'), 'miktar kod sanılmıyor');
select pg_temp.expect(not looks_like_tracking_code('İş Eldiveni'), 'ihtiyaç adı kod sanılmıyor');
select pg_temp.expect(not looks_like_tracking_code('Rize / Ardeşen'), 'il/ilçe kod sanılmıyor');
select pg_temp.expect(not looks_like_tracking_code(''), 'boş metin kod değil');

-- ---------- Herkese açık metin ---------------------------------------------
select pg_temp.expect(
  audit_public_text('Teslimat bildirildi', 'Maske · AFT-4821 · 30 kutu') = 'Maske · 30 kutu',
  'kod düşüyor, ihtiyaç ve miktar KALIYOR');
select pg_temp.expect(
  audit_public_text('Afet oluşturuldu', 'Karaburun Orman Yangını · İzmir') = 'Karaburun Orman Yangını · İzmir',
  'kod içermeyen metin olduğu gibi kalıyor');
select pg_temp.expect(
  audit_public_text('Operasyon aşaması güncellendi', 'iç gerekçe') = '',
  'aşama gerekçesi boş kalmaya devam ediyor (0039)');
select pg_temp.expect(
  audit_public_text('X', 'SOZ-ABC123 · AFT-4821') = '',
  'yalnızca koddan oluşan metin tamamen boşalıyor');

-- ---------- Görünüm ---------------------------------------------------------
do $$
declare v_dis uuid;
begin
  insert into disasters (name, slug, type, province, region, status)
  values ('Kod Sizinti Testi', 'kod-sizinti-testi-0045', 'Wildfire', 'Muğla', 'Test', 'Active')
  returning id into v_dis;

  -- Herkese açık olduğu bilinen bir eylem: kodun görünüp görünmediğini o taşır.
  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (v_dis, 'Test Kisi', 'Teslimat bildirildi', 'Maske · AFT-T0045 · 30 kutu', '—', 'AFT-T0045', '#000');
end $$;

select pg_temp.expect(
  (select count(*) from audit_log_public where detail ~ '[A-Z]{2,6}-[A-Z0-9]{3,}') = 0,
  'herkese açık akışın HİÇBİR satırında takip kodu yok');
select pg_temp.expect(
  (select count(*) from audit_log_public where old_value ~ '[A-Z]{2,6}-[A-Z0-9]{3,}'
                                            or new_value ~ '[A-Z]{2,6}-[A-Z0-9]{3,}') = 0,
  'eski/yeni değer alanlarında da takip kodu yok');
select pg_temp.expect(
  (select detail from audit_log_public where action = 'Teslimat bildirildi'
    and detail like 'Maske%' limit 1) = 'Maske · 30 kutu',
  'olayın operasyonel anlamı korunuyor');

-- İÇ kayıt değişmedi: koordinatör kodu görmeye devam ediyor.
select pg_temp.expect(
  (select count(*) from audit_log where detail like '%AFT-T0045%') = 1,
  'iç denetim kaydında takip kodu DURUYOR');

rollback;
