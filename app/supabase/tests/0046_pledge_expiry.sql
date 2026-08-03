-- AfetHUB — Faz 3-D regresyon testleri (migration 0046)
-- =============================================================================
-- Konu: teslim sözü süre dolumunun ZAMANLANMIŞ hâli. Ölçülenler yetki yüzeyi
-- (zamanlayıcı girişini kimin çağırabildiği), hangi kayıtların etkilendiği,
-- denetim kaydının yazılıp yazılmadığı ve miktar değişmezliği.
--
-- Çalıştırma (şema + tüm migration'lar uygulanmış bir veritabanında):
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0046_pledge_expiry.sql
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

-- ---------- Kurulum ----------------------------------------------------------
create temporary table t_ids (k text primary key, v uuid);

do $$
declare v_dis uuid; v_need uuid; v_loc uuid;
        v_coord uuid := gen_random_uuid(); v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_coord, 'koordinator46@afethub.test'), (v_user, 'normal46@afethub.test');
  -- `full_name` de ÜZERİNE yazılıyor: `auth.users` insert'ü profil satırını
  -- tetikleyiciyle boş adla açıyor ve yalnızca `role`ü güncellemek adı boş
  -- bırakırdı. Denetim kaydındaki aktör adı bu testte ölçülen bir şey.
  insert into profiles (id, full_name, role) values (v_coord, 'Test Koordinator', 'coordinator')
    on conflict (id) do update set role = 'coordinator', full_name = excluded.full_name;
  insert into profiles (id, full_name, role) values (v_user, 'Normal Kullanici', 'volunteer')
    on conflict (id) do update set role = 'volunteer', full_name = excluded.full_name;

  insert into disasters (name, slug, type, province, region, status)
  values ('Test Operasyonu 0046', 'test-operasyonu-0046', 'Wildfire', 'Muğla', 'Seydikemer', 'Active')
  returning id into v_dis;

  insert into locations (disaster_id, name, address, status)
  values (v_dis, 'Test Teslim Noktası', 'Test adres', 'Açık') returning id into v_loc;

  insert into needs (disaster_id, name, category, priority, required_qty, verified_qty, pending_qty, unit, location_name)
  values (v_dis, 'Test Maske', 'Sağlık', 'Critical', 100, 20, 5, 'kutu', 'Test Teslim Noktası')
  returning id into v_need;

  insert into t_ids values ('dis', v_dis), ('need', v_need), ('loc', v_loc),
                           ('coord', v_coord), ('user', v_user);
end $$;

-- Beş söz, beş farklı durum. Hepsi normal yoldan (RPC ile) açılıyor; RPC geçmiş
-- bir tahmini zaman kabul etmediği için zamanın geçmesi sonradan taklit ediliyor.
create temporary table t_codes (k text primary key, v text);
do $$
declare c text; v_need uuid := (select v from t_ids where k='need');
        v_loc uuid := (select v from t_ids where k='loc');
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);

  -- a) pledged, teslim saati 72 saat geçmiş → süresi dolmalı
  c := create_delivery_pledge(v_need, 3, 'kutu', v_loc, now() + interval '2 hours',
       'A Kisi', 'a46@afethub.test', '05000000001', 'Muğla', 'Test kaydı');
  insert into t_codes values ('gecmis_pledged', c);
  update delivery_pledges set estimated_delivery_at = now() - interval '72 hours' where public_tracking_code = c;

  -- b) confirmed, 72 saat geçmiş → süresi dolmalı
  c := create_delivery_pledge(v_need, 3, 'kutu', v_loc, now() + interval '2 hours',
       'B Kisi', 'b46@afethub.test', '05000000002', 'Muğla', 'Test kaydı');
  insert into t_codes values ('gecmis_confirmed', c);
  update delivery_pledges set estimated_delivery_at = now() - interval '72 hours', status = 'confirmed'
   where public_tracking_code = c;

  -- c) in_transit, 72 saat geçmiş → DOKUNULMAMALI (yola çıkmış)
  c := create_delivery_pledge(v_need, 3, 'kutu', v_loc, now() + interval '2 hours',
       'C Kisi', 'c46@afethub.test', '05000000003', 'Muğla', 'Test kaydı');
  insert into t_codes values ('gecmis_in_transit', c);
  update delivery_pledges set estimated_delivery_at = now() - interval '72 hours', status = 'in_transit'
   where public_tracking_code = c;

  -- d) pledged ama tahmini zaman YOK → dokunulmamalı
  c := create_delivery_pledge(v_need, 3, 'kutu', v_loc, now() + interval '2 hours',
       'D Kisi', 'd46@afethub.test', '05000000004', 'Muğla', 'Test kaydı');
  insert into t_codes values ('zamansiz', c);
  update delivery_pledges set estimated_delivery_at = null where public_tracking_code = c;

  -- e) pledged, teslim saati 6 saat geçmiş → 48 saatlik payın İÇİNDE, dokunulmamalı
  c := create_delivery_pledge(v_need, 3, 'kutu', v_loc, now() + interval '2 hours',
       'E Kisi', 'e46@afethub.test', '05000000005', 'Muğla', 'Test kaydı');
  insert into t_codes values ('pay_icinde', c);
  update delivery_pledges set estimated_delivery_at = now() - interval '6 hours' where public_tracking_code = c;
end $$;

-- ---------- 1) Yetki yüzeyi --------------------------------------------------
-- Zamanlayıcı girişi hiçbir istemci rolüne açık DEĞİL. Bu, düğme gizlemeyle değil
-- grant listesiyle sağlanıyor (rules/03 §Server-Side Authorization).
select pg_temp.expect(
  not has_function_privilege('anon', 'expire_stale_pledges_system(integer)', 'execute'),
  'anon expire_stale_pledges_system ÇAĞIRAMIYOR');
select pg_temp.expect(
  not has_function_privilege('authenticated', 'expire_stale_pledges_system(integer)', 'execute'),
  'authenticated expire_stale_pledges_system ÇAĞIRAMIYOR');
select pg_temp.expect(
  not has_function_privilege('anon', 'expire_stale_pledges_core(integer, text)', 'execute'),
  'anon ortak gövdeyi ÇAĞIRAMIYOR');
select pg_temp.expect(
  not has_function_privilege('authenticated', 'expire_stale_pledges_core(integer, text)', 'execute'),
  'authenticated ortak gövdeyi ÇAĞIRAMIYOR');
select pg_temp.expect(
  has_function_privilege('authenticated', 'expire_stale_pledges(integer)', 'execute'),
  'koordinatör girişi authenticated için AÇIK (gövdede rol kontrolü var)');
select pg_temp.expect(
  not has_function_privilege('anon', 'expire_stale_pledges(integer)', 'execute'),
  'anon koordinatör girişini de ÇAĞIRAMIYOR');

-- Rol kontrolü gövdede: authenticated olmak yetmiyor.
select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', (select v from t_ids where k='user')), true);
select pg_temp.expect_error('select expire_stale_pledges(48)',
  'normal kullanıcı süre dolumunu ÇALIŞTIRAMIYOR');

-- ---------- 2) Taban ölçüm ---------------------------------------------------
create temporary table t_before as
  select (select count(*) from audit_log) as audit_rows,
         (select required_qty from needs where id = (select v from t_ids where k='need')) as required_qty,
         (select verified_qty from needs where id = (select v from t_ids where k='need')) as verified_qty,
         (select pending_qty  from needs where id = (select v from t_ids where k='need')) as pending_qty,
         (select remaining_qty from needs where id = (select v from t_ids where k='need')) as remaining_qty;

-- ---------- 3) Zamanlayıcı çalışıyor ----------------------------------------
-- `expire_stale_pledges_system` normalde yalnızca pg_cron tarafından çağrılır;
-- burada sahibi (postgres) olarak çağrılıyor — cron işinin çalıştığı bağlam bu.
create temporary table t_run as select expire_stale_pledges_system(48) as n;

select pg_temp.expect((select n from t_run) = 2,
  'süresi dolan iki kayıt (pledged + confirmed) işaretlendi, diğer üçü değil');

select pg_temp.expect(
  (select status from delivery_pledges where public_tracking_code = (select v from t_codes where k='gecmis_pledged')) = 'expired',
  'pledged kayıt expired oldu');
select pg_temp.expect(
  (select status from delivery_pledges where public_tracking_code = (select v from t_codes where k='gecmis_confirmed')) = 'expired',
  'confirmed kayıt expired oldu');
select pg_temp.expect(
  (select status from delivery_pledges where public_tracking_code = (select v from t_codes where k='gecmis_in_transit')) = 'in_transit',
  'YOLDA olan kayda DOKUNULMADI');
select pg_temp.expect(
  (select status from delivery_pledges where public_tracking_code = (select v from t_codes where k='zamansiz')) = 'pledged',
  'tahmini zamanı olmayan kayda DOKUNULMADI');
select pg_temp.expect(
  (select status from delivery_pledges where public_tracking_code = (select v from t_codes where k='pay_icinde')) = 'pledged',
  '48 saatlik payın içindeki kayda DOKUNULMADI');

-- ---------- 4) Denetim kaydı -------------------------------------------------
select pg_temp.expect(
  (select count(*) from audit_log where action = 'Teslim sözünün süresi doldu'
     and detail in (select v from t_codes)) = 2,
  'kayıt BAŞINA bir denetim satırı yazıldı');
select pg_temp.expect(
  (select count(*) from audit_log where action = 'Teslim sözünün süresi doldu' and actor = 'Sistem'
     and detail in (select v from t_codes)) = 2,
  'denetim satırlarının aktörü Sistem — insan kararı gibi görünmüyor');
select pg_temp.expect(
  (select count(*) from audit_log where action = 'Teslim sözünün süresi doldu'
     and new_value = 'expired' and old_value in ('pledged','confirmed')
     and detail in (select v from t_codes)) = 2,
  'denetim satırı eski ve yeni durumu taşıyor');
select pg_temp.expect(
  (select audit_rows from t_before) + 2 = (select count(*) from audit_log),
  'iki satırdan başka denetim kaydı üretilmedi');

-- Süre dolumu HERKESE AÇIK akışa düşmüyor (direktif §28).
select pg_temp.expect(not audit_is_public('Teslim sözünün süresi doldu'),
  'süre dolumu herkese açık eylem listesinde DEĞİL');
select pg_temp.expect(
  (select count(*) from audit_log_public where action = 'Teslim sözünün süresi doldu') = 0,
  'süre dolumu herkese açık akışta GÖRÜNMÜYOR');

-- ---------- 5) Miktar değişmezliği ------------------------------------------
select pg_temp.expect(
  (select required_qty  from needs where id = (select v from t_ids where k='need')) = (select required_qty from t_before)
  and (select verified_qty  from needs where id = (select v from t_ids where k='need')) = (select verified_qty from t_before)
  and (select pending_qty   from needs where id = (select v from t_ids where k='need')) = (select pending_qty from t_before)
  and (select remaining_qty from needs where id = (select v from t_ids where k='need')) = (select remaining_qty from t_before),
  'süre dolumu HİÇBİR miktarı değiştirmedi');

-- ---------- 6) Tekrar çalıştırma ---------------------------------------------
-- Zamanlanmış bir iş saatte bir çalışır: ikinci koşu ne yeni bir durum değişikliği
-- ne de ikinci bir denetim satırı üretmeli (rules/03 §Idempotency).
select pg_temp.expect(expire_stale_pledges_system(48) = 0,
  'ikinci koşu hiçbir kaydı etkilemiyor');
select pg_temp.expect(
  (select count(*) from audit_log where action = 'Teslim sözünün süresi doldu'
     and detail in (select v from t_codes)) = 2,
  'ikinci koşu ikinci denetim satırı YAZMIYOR');

-- ---------- 7) Kapalı kayıtlar geri açılmıyor -------------------------------
-- `expired` ve `cancelled` durumdan çıkış yok: durum makinesi tek kaynak.
select pg_temp.expect(not pledge_transition_allowed('expired', 'confirmed'),
  'expired → confirmed YASAK');
select pg_temp.expect(not pledge_transition_allowed('cancelled', 'expired'),
  'cancelled → expired YASAK (iptal edilmiş kayıt süre dolumuna girmez)');

-- ---------- 8) Koordinatör girişi aynı gövdeyi kullanıyor -------------------
select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', (select v from t_ids where k='coord')), true);
do $$
declare c text; v_need uuid := (select v from t_ids where k='need');
        v_loc uuid := (select v from t_ids where k='loc');
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  c := create_delivery_pledge(v_need, 3, 'kutu', v_loc, now() + interval '2 hours',
       'F Kisi', 'f46@afethub.test', '05000000006', 'Muğla', 'Test kaydı');
  insert into t_codes values ('koord_gecmis', c);
  update delivery_pledges set estimated_delivery_at = now() - interval '72 hours' where public_tracking_code = c;
end $$;
select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', (select v from t_ids where k='coord')), true);

select pg_temp.expect(expire_stale_pledges(48) = 1,
  'koordinatör elle çalıştırınca da kayıt işaretleniyor');
select pg_temp.expect(
  (select actor from audit_log where action = 'Teslim sözünün süresi doldu'
     and detail = (select v from t_codes where k='koord_gecmis')) = 'Test Koordinator',
  'elle çalıştırmada aktör koordinatörün kendisi — Sistem DEĞİL');

rollback;
