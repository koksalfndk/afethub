-- AfetHUB — Faz 3-D regresyon testleri (migration 0047)
-- =============================================================================
-- Konu: teslim sözü listesinin dışa aktarım kaydı. Ölçülenler yetki, denetim
-- satırının içeriği, görünüm adının doğrulanması ve herkese açık akışa
-- düşmemesi.
--
-- Çalıştırma:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0047_pledge_export.sql
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

create temporary table t_ids (k text primary key, v uuid);

do $$
declare v_dis uuid; v_coord uuid := gen_random_uuid(); v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_coord, 'koordinator47@afethub.test'), (v_user, 'normal47@afethub.test');
  insert into profiles (id, full_name, role) values (v_coord, 'Test Koordinator', 'coordinator')
    on conflict (id) do update set role = 'coordinator', full_name = excluded.full_name;
  insert into profiles (id, full_name, role) values (v_user, 'Normal Kullanici', 'volunteer')
    on conflict (id) do update set role = 'volunteer', full_name = excluded.full_name;

  insert into disasters (name, slug, type, province, region, status)
  values ('Test Operasyonu 0047', 'test-operasyonu-0047', 'Wildfire', 'Muğla', 'Seydikemer', 'Active')
  returning id into v_dis;

  insert into t_ids values ('dis', v_dis), ('coord', v_coord), ('user', v_user);
end $$;

-- ---------- 1) Yetki -------------------------------------------------------
select pg_temp.expect(
  not has_function_privilege('anon', 'log_pledge_export(text, integer, uuid)', 'execute'),
  'anon dışa aktarma kaydını YAZAMIYOR');
select pg_temp.expect(
  has_function_privilege('authenticated', 'log_pledge_export(text, integer, uuid)', 'execute'),
  'authenticated için yüzey açık (rol kontrolü gövdede)');

select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect_error($$select log_pledge_export('all', 5, null)$$,
  'anon çağrısı REDDEDİLİYOR');

select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', (select v from t_ids where k='user')), true);
select pg_temp.expect_error($$select log_pledge_export('all', 5, null)$$,
  'normal kullanıcı çağrısı REDDEDİLİYOR');

-- ---------- 2) Koordinatör çağrısı bir satır yazıyor ------------------------
create temporary table t_before as select count(*) as n from audit_log;

select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', (select v from t_ids where k='coord')), true);
select log_pledge_export('overdue', 42, (select v from t_ids where k='dis'));

select pg_temp.expect((select n from t_before) + 1 = (select count(*) from audit_log),
  'tam olarak bir denetim satırı yazıldı');
select pg_temp.expect(
  (select count(*) from audit_log
     where action = 'Teslim sözü listesi dışa aktarıldı'
       and actor = 'Test Koordinator' and detail = 'overdue'
       and new_value = '42 satır'
       and disaster_id = (select v from t_ids where k='dis')) = 1,
  'satır aktörü, görünümü ve kayıt sayısını taşıyor');

-- ---------- 3) Görünüm adı doğrulanıyor ------------------------------------
-- İstemciden gelen dize denetim kaydına olduğu gibi girmemeli.
select log_pledge_export('<script>alert(1)</script>', 3, null);
select pg_temp.expect(
  (select count(*) from audit_log where action = 'Teslim sözü listesi dışa aktarıldı'
     and detail = 'bilinmeyen') = 1,
  'bilinmeyen görünüm adı olduğu gibi yazılmıyor');
select pg_temp.expect(
  (select count(*) from audit_log where detail like '%script%') = 0,
  'istemciden gelen serbest metin denetim kaydına GİRMİYOR');

-- Negatif satır sayısı sıfıra çekiliyor.
select log_pledge_export('today', -7, null);
select pg_temp.expect(
  (select count(*) from audit_log where action = 'Teslim sözü listesi dışa aktarıldı'
     and detail = 'today' and new_value = '0 satır') = 1,
  'negatif kayıt sayısı sıfıra çekiliyor');

-- ---------- 4) Herkese açık akışa düşmüyor ---------------------------------
select pg_temp.expect(not audit_is_public('Teslim sözü listesi dışa aktarıldı'),
  'dışa aktarma herkese açık eylem listesinde DEĞİL');
select pg_temp.expect(
  (select count(*) from audit_log_public where action = 'Teslim sözü listesi dışa aktarıldı') = 0,
  'dışa aktarma herkese açık akışta GÖRÜNMÜYOR');

-- ---------- 5) Fonksiyon veri döndürmüyor ----------------------------------
-- Dışa aktarma yüzeyi yeni bir okuma yolu AÇMAMALI: satırlar hâlâ liste
-- fonksiyonundan geliyor ve onun maskeleme kuralları geçerli.
select pg_temp.expect(
  (select pg_get_function_result(p.oid) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'log_pledge_export') = 'void',
  'kayıt fonksiyonu hiçbir veri döndürmüyor');

rollback;
