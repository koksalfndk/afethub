-- AfetHUB — Faz 4-A regresyon testleri (migration 0050)
-- =============================================================================
-- Konu: fotoğraf moderasyonunun okuma yolu. Ölçülenler: koordinatör listesi,
-- anon engeli, kayıt–moderasyon akışının galeriye yansıması ve moderasyonun
-- olay ÜRETMEMESİ (fotoğraf kararı bir metin yayını değildir).
--
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0050_update_attachment_listing.sql
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
declare v_dis uuid; v_upd uuid; v_att uuid;
        v_coord uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_coord, 'koordinator50@afethub.test');
  insert into profiles (id, full_name, role) values (v_coord, 'Test Koordinator 50', 'coordinator')
    on conflict (id) do update set role = 'coordinator';

  insert into disasters (name, slug, type, province, region, status)
  values ('Test Operasyonu 0050', 'test-operasyonu-0050', 'Wildfire', 'Muğla', 'Seydikemer', 'Active')
  returning id into v_dis;
  insert into t_ids values ('dis', v_dis), ('coord', v_coord);
end $$;

-- Misafir bildirimi + fotoğraf kaydı (misafir 30 dakikalık pencerede ekleyebilir)
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare v_upd uuid; v_att uuid;
begin
  v_upd := submit_operation_update(
    (select v from t_ids where k='dis'), 'field_report',
    'Ornek bildirim (demo) — fotograf testi.',
    null, null, '', 'Test Kisi', 'saha50@afethub.test', '');
  insert into t_ids values ('upd', v_upd);
  v_att := register_update_attachment(
    v_upd,
    (select v from t_ids where k='dis')::text || '/' || v_upd::text || '/deneme.webp',
    'image/webp', 123456, 800, 600, 'Deneme fotograf', null, 'Merkez');
  insert into t_ids values ('att', v_att);
end $$;

-- ---------- 1) Yetki ----------------------------------------------------------
select pg_temp.expect(
  not has_function_privilege('anon', 'list_update_attachments(uuid)', 'EXECUTE'),
  'ek listesi anon''a kapalı');
select pg_temp.expect_error(
  format('select * from list_update_attachments(%L)', (select v from t_ids where k='upd')),
  'anon bağlamında liste çağrısı reddediliyor');

-- ---------- 2) Koordinatör listesi -------------------------------------------
select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', (select v from t_ids where k='coord')), true);

select pg_temp.expect(
  (select count(*) from list_update_attachments((select v from t_ids where k='upd'))) = 1,
  'koordinatör güncellemenin ekini listeleyebiliyor');
select pg_temp.expect(
  (select moderation_status from list_update_attachments((select v from t_ids where k='upd'))) = 'pending',
  'misafir eki bekleyen durumda doğuyor');

-- ---------- 3) Bekleyen ek galeriye SIZMIYOR ---------------------------------
select pg_temp.expect(
  (select count(*) from operation_media_public
    where operation_update_id = (select v from t_ids where k='upd')) = 0,
  'bekleyen ek herkese açık galeride YOK');

-- ---------- 4) Onay + yayın → galeri -----------------------------------------
select moderate_update_attachment((select v from t_ids where k='att'), 'approved', '');
select pg_temp.expect(
  (select count(*) from operation_media_public
    where operation_update_id = (select v from t_ids where k='upd')) = 0,
  'onaylı ek, güncelleme YAYIMLANMADAN galeride görünmüyor');

select moderate_operation_update((select v from t_ids where k='upd'), 'publish', '');
select pg_temp.expect(
  (select count(*) from operation_media_public
    where operation_update_id = (select v from t_ids where k='upd')) = 1,
  'onaylı ek + yayımlanmış güncelleme galeride');
select pg_temp.expect(
  (select photo_count from operation_updates_public
    where id = (select v from t_ids where k='upd')) = 1,
  'herkese açık kart fotoğraf sayısını taşıyor');

-- ---------- 5) Ret → galeriden düşer, kayıt durur ----------------------------
select moderate_update_attachment((select v from t_ids where k='att'), 'rejected', 'Bulanik');
select pg_temp.expect(
  (select count(*) from operation_media_public
    where operation_update_id = (select v from t_ids where k='upd')) = 0,
  'reddedilen ek galeriden düşüyor');
select pg_temp.expect(
  (select moderation_status = 'rejected' and moderation_reason = 'Bulanik'
     from list_update_attachments((select v from t_ids where k='upd'))),
  'ret kaydı gerekçesiyle duruyor (silinmiyor)');

-- ---------- 6) Fotoğraf kararı OLAY üretmiyor --------------------------------
-- Olay akışı metin yayınının sinyali; fotoğraf onayı `updated` bile değil —
-- istemci fotoğrafları kart açılınca zaten tazeliyor.
select pg_temp.expect(
  (select count(*) from operation_update_events_public
    where update_id = (select v from t_ids where k='upd')
      and event_type not in ('published', 'hidden')) = 0,
  'fotoğraf moderasyonu ek olay üretmedi');

rollback;
