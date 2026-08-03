-- AfetHUB — Faz 3-C regresyon testleri (migration 0044)
-- =============================================================================
-- Neden SQL: burada doğrulanan şeylerin hepsi VERİTABANI kuralları — yetki, durum
-- makinesi, maskeleme, bağlama kısıtları, miktar değişmezliği. Bir tarayıcı testi
-- bunların hiçbirini kanıtlayamaz (rules/03 §Server-Side Authorization).
--
-- Çalıştırma (şema + tüm migration'lar uygulanmış bir veritabanında):
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0044_pledge_operations.sql
--
-- Test verisi bir işlem içinde açılır ve SONUNDA GERİ ALINIR: canlı bir projede
-- çalıştırıldığında geriye hiçbir satır bırakmaz.
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

-- ---------- Kurulum ----------------------------------------------------------
create temporary table t_ids (k text primary key, v uuid);

do $$
declare v_dis uuid; v_need uuid; v_loc uuid; v_sub uuid; v_sub2 uuid;
        v_coord uuid := gen_random_uuid(); v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_coord, 'koordinator@afethub.test'), (v_user, 'normal@afethub.test');
  insert into profiles (id, full_name, role) values (v_coord, 'Test Koordinator', 'coordinator')
    on conflict (id) do update set role = 'coordinator';
  insert into profiles (id, full_name, role) values (v_user, 'Normal Kullanici', 'volunteer')
    on conflict (id) do update set role = 'volunteer';

  insert into disasters (name, slug, type, province, region, status)
  values ('Test Operasyonu', 'test-operasyonu-0044', 'Wildfire', 'Muğla', 'Seydikemer', 'Active')
  returning id into v_dis;

  insert into locations (disaster_id, name, address, status)
  values (v_dis, 'Test Teslim Noktası', 'Test adres', 'Açık') returning id into v_loc;

  insert into needs (disaster_id, name, category, priority, required_qty, verified_qty, pending_qty, unit, location_name)
  values (v_dis, 'Test Maske', 'Sağlık', 'Critical', 100, 0, 0, 'kutu', 'Test Teslim Noktası')
  returning id into v_need;

  insert into submissions (code, disaster_id, need_id, contributor_name, contributor_email, contributor_phone,
                           city, qty, unit, location_name, status)
  values ('AFT-T0044A', v_dis, v_need, 'Bildirim Sahibi', 'bildirim@afethub.test', '05001112233',
          'Muğla', 10, 'kutu', 'Test Teslim Noktası', 'Pending verification')
  returning id into v_sub;

  insert into submissions (code, disaster_id, need_id, contributor_name, contributor_email, contributor_phone,
                           city, qty, unit, location_name, status)
  values ('AFT-T0044B', v_dis, v_need, 'Ikinci Bildirim', 'bildirim2@afethub.test', '05001112244',
          'Muğla', 10, 'kutu', 'Test Teslim Noktası', 'Pending verification')
  returning id into v_sub2;

  insert into t_ids values ('dis', v_dis), ('need', v_need), ('loc', v_loc),
                           ('sub', v_sub), ('sub2', v_sub2), ('coord', v_coord), ('user', v_user);
end $$;

-- ---------- 1) Maskeleme -----------------------------------------------------
select pg_temp.expect(mask_email('koksal@example.com') = 'k***@example.com',
  'e-posta maskesi yalnızca ilk harfi ve alan adını bırakıyor');
select pg_temp.expect(mask_email('') = '', 'boş e-posta boş kalıyor');
select pg_temp.expect(mask_phone('0500 111 22 33') like '%2233',
  'telefon maskesi yalnızca son dört haneyi bırakıyor');
select pg_temp.expect(mask_phone('0500 111 22 33') not like '%111%',
  'telefon maskesi orta haneleri GÖSTERMİYOR');
select pg_temp.expect(mask_person('Köksal Fındık') = 'K*** F***',
  'ad soyad baş harflere iniyor');
select pg_temp.expect(mask_person('') = '', 'boş ad boş kalıyor');

-- ---------- 2) Durum makinesi ------------------------------------------------
select pg_temp.expect(pledge_transition_allowed('pledged','confirmed'),
  'pledged → confirmed serbest');
select pg_temp.expect(pledge_transition_allowed('in_transit','delivered_reported'),
  'in_transit → delivered_reported serbest');
select pg_temp.expect(not pledge_transition_allowed('cancelled','in_transit'),
  'cancelled → in_transit YASAK');
select pg_temp.expect(not pledge_transition_allowed('expired','confirmed'),
  'expired → confirmed YASAK');
select pg_temp.expect(not pledge_transition_allowed('fulfilled','cancelled'),
  'fulfilled → cancelled YASAK');
select pg_temp.expect(not pledge_transition_allowed('delivered_reported','pledged'),
  'delivered_reported → pledged YASAK');

-- ---------- 3) Yetki: anon ve normal kullanıcı ------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect_error(
  'select * from list_delivery_pledges_for_coordinator()',
  'anon koordinatör listesini OKUYAMIYOR');

select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', (select v from t_ids where k='user')), true);
select pg_temp.expect_error(
  'select * from list_delivery_pledges_for_coordinator()',
  'normal kullanıcı koordinatör listesini OKUYAMIYOR');
select pg_temp.expect_error(
  format('select * from get_delivery_pledge_contact(%L, %L)', gen_random_uuid(), 'test'),
  'normal kullanıcı tam iletişim bilgisini ALAMIYOR');

-- ---------- 4) Misafir sözü oluşturuyor -------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);

create temporary table t_codes (k text primary key, v text);
do $$
declare c text;
begin
  -- RPC geçmiş bir tahmini zamanı kabul etmiyor (sunucu doğrulaması). Söz normal
  -- yoldan ileri bir zamanla açılıyor, sonra ZAMANIN GEÇMESİ taklit ediliyor:
  -- test bir işlem içinde ve sonunda geri alınıyor.
  c := create_delivery_pledge(
    (select v from t_ids where k='need'), 6, 'kutu',
    (select v from t_ids where k='loc'), now() + interval '2 hours',
    'Soz Sahibi', 'soz@afethub.test', '05009998877', 'Muğla', 'Test');
  insert into t_codes values ('a', c);
  update delivery_pledges set estimated_delivery_at = now() - interval '3 hours'
   where public_tracking_code = c;
end $$;

-- Miktarlar DEĞİŞMEDİ.
select pg_temp.expect(
  (select required_qty = 100 and verified_qty = 0 and pending_qty = 0 and remaining_qty = 100
     from needs where id = (select v from t_ids where k='need')),
  'teslim sözü hiçbir miktarı değiştirmedi');

-- ---------- 5) Koordinatör listesi ------------------------------------------
select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', (select v from t_ids where k='coord')), true);

select pg_temp.expect(
  (select count(*) from list_delivery_pledges_for_coordinator(
     p_disaster => (select v from t_ids where k='dis'))) = 1,
  'koordinatör listede sözü görüyor');

-- Liste TAM iletişim verisi taşımıyor.
select pg_temp.expect(
  (select contact_masked = 'S*** S***' and email_masked = 's***@afethub.test'
     from list_delivery_pledges_for_coordinator(p_disaster => (select v from t_ids where k='dis')) limit 1),
  'liste yalnızca maskeli iletişim döndürüyor');
select pg_temp.expect(
  (select phone_masked not like '%9998%'
     from list_delivery_pledges_for_coordinator(p_disaster => (select v from t_ids where k='dis')) limit 1),
  'liste telefonun orta hanelerini taşımıyor');

-- Gecikme SUNUCUDA hesaplanıyor: tahmini zaman 3 saat önceydi.
select pg_temp.expect(
  (select overdue_minutes between 170 and 190
     from list_delivery_pledges_for_coordinator(p_disaster => (select v from t_ids where k='dis')) limit 1),
  'gecikme sunucu saatiyle hesaplanıyor (~180 dakika)');

select pg_temp.expect(
  (select count(*) from list_delivery_pledges_for_coordinator(
     p_disaster => (select v from t_ids where k='dis'), p_view => 'overdue')) = 1,
  'geciken görünümü sorguya yansıyor');
select pg_temp.expect(
  (select count(*) from list_delivery_pledges_for_coordinator(
     p_disaster => (select v from t_ids where k='dis'), p_view => 'upcoming')) = 0,
  'geçmiş tarihli söz "yaklaşan" görünümünde ÇIKMIYOR');

-- Arama yalnızca izin verilen alanlarda: e-postayla arama sonuç VERMEMELİ.
select pg_temp.expect(
  (select count(*) from list_delivery_pledges_for_coordinator(
     p_disaster => (select v from t_ids where k='dis'), p_search => 'soz@afethub.test')) = 0,
  'e-posta ile arama sonuç DÖNDÜRMÜYOR');
select pg_temp.expect(
  (select count(*) from list_delivery_pledges_for_coordinator(
     p_disaster => (select v from t_ids where k='dis'), p_search => 'Maske')) = 1,
  'ihtiyaç adıyla arama çalışıyor');

-- Sayfalama
select pg_temp.expect(
  (select total_count from list_delivery_pledges_for_coordinator(
     p_disaster => (select v from t_ids where k='dis'), p_limit => 1) limit 1) = 1,
  'toplam sayı sayfalamadan bağımsız dönüyor');

-- ---------- 6) Tam iletişim: gerekçe zorunlu, denetim yazılıyor -------------
select pg_temp.expect_error(
  format('select * from get_delivery_pledge_contact((select id from delivery_pledges where public_tracking_code = %L), %L)',
         (select v from t_codes where k='a'), ''),
  'gerekçesiz iletişim görüntüleme REDDEDİLİYOR');

do $$
declare n_before bigint; n_after bigint; r record;
begin
  select count(*) into n_before from audit_log
   where action = 'Teslim sözü iletişim bilgisi görüntülendi';
  select * into r from get_delivery_pledge_contact(
    (select id from delivery_pledges where public_tracking_code = (select v from t_codes where k='a')),
    'Teslimat saatini teyit etmek icin');
  select count(*) into n_after from audit_log
   where action = 'Teslim sözü iletişim bilgisi görüntülendi';
  perform pg_temp.expect(r.email = 'soz@afethub.test', 'gerekçeli çağrı tam e-postayı döndürüyor');
  perform pg_temp.expect(r.phone = '05009998877', 'gerekçeli çağrı tam telefonu döndürüyor');
  perform pg_temp.expect(n_after = n_before + 1, 'iletişim görüntüleme denetim kaydı yazıyor');
end $$;

select pg_temp.expect(
  (select count(*) from audit_log_public where action like '%iletişim bilgisi%') = 0,
  'iletişim görüntüleme kaydı HERKESE AÇIK akışa düşmüyor');

-- ---------- 7) Durum geçişleri ----------------------------------------------
do $$
declare pid uuid;
begin
  select id into pid from delivery_pledges where public_tracking_code = (select v from t_codes where k='a');
  perform pg_temp.expect(set_pledge_status(pid, 'confirmed', '') = 'confirmed',
    'pledged → confirmed çalışıyor');
  -- Tekrar aynı durum: yan etki YOK.
  perform pg_temp.expect(set_pledge_status(pid, 'confirmed', '') = 'confirmed',
    'aynı durumu tekrar yazmak hata vermiyor');
  perform pg_temp.expect(
    (select count(*) from audit_log where action = 'Teslim sözü teyit edildi'
       and detail = (select v from t_codes where k='a')) = 1,
    'tekrar çağrı İKİNCİ bir denetim satırı üretmiyor');
  perform pg_temp.expect(set_pledge_status(pid, 'in_transit', '') = 'in_transit',
    'confirmed → in_transit çalışıyor');
end $$;

select pg_temp.expect_error(
  format('select set_pledge_status((select id from delivery_pledges where public_tracking_code = %L), ''pledged'', '''')',
         (select v from t_codes where k='a')),
  'in_transit → pledged geri dönüşü REDDEDİLİYOR');

select pg_temp.expect_error(
  format('select set_pledge_status((select id from delivery_pledges where public_tracking_code = %L), ''fulfilled'', '''')',
         (select v from t_codes where k='a')),
  'fulfilled elle YAZILAMIYOR');

-- ---------- 8) Bildirime bağlama --------------------------------------------
select pg_temp.expect(
  (select count(*) from list_linkable_submissions(
     (select id from delivery_pledges where public_tracking_code = (select v from t_codes where k='a')))) = 2,
  'aynı ihtiyaca ait iki bildirim aday olarak listeleniyor');

do $$
declare pid uuid; before_req int; before_ver int; before_pend int; before_rem int;
begin
  select id into pid from delivery_pledges where public_tracking_code = (select v from t_codes where k='a');
  select required_qty, verified_qty, pending_qty, remaining_qty
    into before_req, before_ver, before_pend, before_rem
    from needs where id = (select v from t_ids where k='need');

  perform pg_temp.expect(
    link_pledge_to_submission_coord(pid, (select v from t_ids where k='sub')) = 'delivered_reported',
    'söz fiziksel teslimata bağlanıyor');

  perform pg_temp.expect(
    (select required_qty = before_req and verified_qty = before_ver
        and pending_qty = before_pend and remaining_qty = before_rem
       from needs where id = (select v from t_ids where k='need')),
    'BAĞLAMA hiçbir miktarı değiştirmiyor');

  -- Tekrar bağlama: yan etkisiz.
  perform pg_temp.expect(
    link_pledge_to_submission_coord(pid, (select v from t_ids where k='sub')) = 'delivered_reported',
    'aynı bağlama tekrarı hata vermiyor');
  perform pg_temp.expect(
    (select count(*) from audit_log where action = 'Teslim sözü fiziksel teslimata bağlandı') = 1,
    'tekrar bağlama İKİNCİ bir denetim satırı üretmiyor');
end $$;

-- Aynı söz ikinci bir bildirime bağlanamaz.
select pg_temp.expect_error(
  format('select link_pledge_to_submission_coord((select id from delivery_pledges where public_tracking_code = %L), %L)',
         (select v from t_codes where k='a'), (select v from t_ids where k='sub2')),
  'aynı söz İKİNCİ bir bildirime bağlanamıyor');

-- Aynı bildirim ikinci bir söze bağlanamaz.
do $$
declare c2 text; pid2 uuid;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  c2 := create_delivery_pledge((select v from t_ids where k='need'), 4, 'kutu',
        (select v from t_ids where k='loc'), now() + interval '2 hours',
        'Ikinci Soz', 'soz2@afethub.test', '', 'Muğla', '');
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', (select v from t_ids where k='coord')), true);
  select id into pid2 from delivery_pledges where public_tracking_code = c2;
  insert into t_codes values ('b', c2);
  begin
    perform link_pledge_to_submission_coord(pid2, (select v from t_ids where k='sub'));
    raise exception 'FAIL: aynı bildirim ikinci bir söze bağlandı';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'ok   aynı bildirim İKİNCİ bir söze bağlanamıyor';
  end;
end $$;

-- Aday listesinde bağlı bildirim artık YOK.
select pg_temp.expect(
  (select count(*) from list_linkable_submissions(
     (select id from delivery_pledges where public_tracking_code = (select v from t_codes where k='b')))) = 1,
  'bağlanmış bildirim aday listesinden düşüyor');

-- ---------- 9) İptal ---------------------------------------------------------
do $$
declare pid2 uuid; before_rem int;
begin
  select id into pid2 from delivery_pledges where public_tracking_code = (select v from t_codes where k='b');
  select remaining_qty into before_rem from needs where id = (select v from t_ids where k='need');
  perform pg_temp.expect(set_pledge_status(pid2, 'cancelled', 'Test iptali') = 'cancelled',
    'koordinatör aktif bir sözü iptal edebiliyor');
  perform pg_temp.expect(
    (select cancel_reason = 'Test iptali' and cancelled_at is not null
       from delivery_pledges where id = pid2),
    'iptal nedeni ve zamanı korunuyor');
  perform pg_temp.expect(
    (select remaining_qty = before_rem from needs where id = (select v from t_ids where k='need')),
    'İPTAL kalan miktarı değiştirmiyor');
end $$;

-- İptal edilen söz canlı toplamdan düşüyor.
select pg_temp.expect(
  (select coalesce(sum(pledged_qty), 0) from need_pledge_totals
    where need_id = (select v from t_ids where k='need')) = 0,
  'iptal ve teslim bildirilen sözler canlı toplamda YOK');

-- ---------- 10) Özet ---------------------------------------------------------
select pg_temp.expect(
  (select reported_count from delivery_pledge_summary((select v from t_ids where k='dis'))) = 1,
  'özet: teslim bildirilen sayısı doğru');
select pg_temp.expect(
  (select cancelled_count from delivery_pledge_summary((select v from t_ids where k='dis'))) = 1,
  'özet: iptal sayısı doğru');
select pg_temp.expect(
  (select active_count from delivery_pledge_summary((select v from t_ids where k='dis'))) = 1,
  'özet/rozet: iptal ve süresi dolmuş kayıtlar SAYILMIYOR');

-- ---------- 11) Denetim görünürlüğü -----------------------------------------
select pg_temp.expect(
  (select count(*) from audit_log_public where action like 'Teslim sözü%') = 0,
  'teslim sözü eylemlerinin HİÇBİRİ herkese açık akışta yok');
select pg_temp.expect(
  (select count(*) from audit_log_public where detail like '%SOZ-%') = 0,
  'takip kodu herkese açık akışta görünmüyor');

rollback;
