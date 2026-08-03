-- AfetHUB — Faz 4-A regresyon testleri (migration 0048)
-- =============================================================================
-- Konu: herkese açık Realtime projeksiyonu. Ölçülenler: hangi olayın üretildiği,
-- olay yükünün NE TAŞIMADIĞI, publication yüzeyi, sabitleme limiti ve cursor
-- sayfalamasının operasyon sınırını aşmaması.
--
-- Çalıştırma:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0048_operation_updates_realtime.sql
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
declare v_dis uuid; v_dis2 uuid; v_need uuid; v_loc uuid;
        v_coord uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_coord, 'koordinator48@afethub.test');
  insert into profiles (id, full_name, role) values (v_coord, 'Test Koordinator', 'coordinator')
    on conflict (id) do update set role = 'coordinator', full_name = excluded.full_name;

  insert into disasters (name, slug, type, province, region, status)
  values ('Test Operasyonu 0048', 'test-operasyonu-0048', 'Wildfire', 'Muğla', 'Seydikemer', 'Active')
  returning id into v_dis;
  insert into disasters (name, slug, type, province, region, status)
  values ('Ikinci Operasyon 0048', 'ikinci-operasyon-0048', 'Flood', 'Rize', 'Ardeşen', 'Active')
  returning id into v_dis2;

  insert into locations (disaster_id, name, address, status)
  values (v_dis, 'Test Teslim Noktası', 'Test adres', 'Açık') returning id into v_loc;
  insert into needs (disaster_id, name, category, priority, required_qty, verified_qty, pending_qty, unit, location_name)
  values (v_dis, 'Test Maske', 'Sağlık', 'Critical', 100, 0, 0, 'kutu', 'Test Teslim Noktası')
  returning id into v_need;

  insert into t_ids values ('dis', v_dis), ('dis2', v_dis2), ('need', v_need),
                           ('loc', v_loc), ('coord', v_coord);
end $$;

-- ---------- 1) Olay tablosunun ŞEKLİ -----------------------------------------
-- En önemli iddia: tabloda içerik ve kişisel veri sütunu YOK. Bir gün biri
-- `body` eklerse bu test düşer ve mimarinin gerekçesi hatırlatılır.
select pg_temp.expect(
  not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='operation_update_events_public'
       and column_name in ('body','title','approximate_location','author_user_id',
                           'author_label','organization_id','moderation_reason',
                           'storage_path','email','phone','contact_name','note')),
  'olay tablosunda içerik veya kişisel veri sütunu YOK');
select pg_temp.expect(
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='operation_update_events_public') = 7,
  'olay tablosu yalnızca yedi sütun taşıyor');

-- ---------- 2) Publication yüzeyi --------------------------------------------
select pg_temp.expect(
  exists (select 1 from pg_publication_tables
           where pubname='supabase_realtime' and schemaname='public'
             and tablename='operation_update_events_public'),
  'olay tablosu publication''da');
select pg_temp.expect(
  (select count(*) from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public'
      and tablename='operation_update_events_public') = 1,
  'olay tablosu publication''da yalnızca BİR KEZ');
select pg_temp.expect(
  not exists (select 1 from pg_publication_tables
               where pubname='supabase_realtime' and schemaname='public'
                 and tablename in ('operation_updates','operation_update_contacts',
                                   'operation_update_attachments','operation_update_reports')),
  'base tablolar publication''da DEĞİL');

-- ---------- 3) Olay tablosu yetkileri ----------------------------------------
select pg_temp.expect(
  has_table_privilege('anon', 'operation_update_events_public', 'SELECT'),
  'anon olay tablosunu okuyabiliyor');
select pg_temp.expect(
  not has_table_privilege('anon', 'operation_update_events_public', 'INSERT')
  and not has_table_privilege('anon', 'operation_update_events_public', 'UPDATE')
  and not has_table_privilege('anon', 'operation_update_events_public', 'DELETE'),
  'anon olay YAZAMIYOR');
select pg_temp.expect(
  not has_table_privilege('authenticated', 'operation_update_events_public', 'INSERT')
  and not has_table_privilege('authenticated', 'operation_update_events_public', 'UPDATE')
  and not has_table_privilege('authenticated', 'operation_update_events_public', 'DELETE'),
  'authenticated olay YAZAMIYOR');
select pg_temp.expect(
  not has_function_privilege('anon', 'emit_operation_update_event()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'emit_operation_update_event()', 'EXECUTE'),
  'olay üretici fonksiyon istemci rollerine KAPALI');

-- ---------- 4) Moderasyon bekleyen kayıt olay ÜRETMEZ ------------------------
create temporary table t_upd (k text primary key, v uuid);

select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare v_id uuid;
begin
  v_id := submit_operation_update(
    (select v from t_ids where k='dis'), 'field_report',
    'Ornek saha bildirimi (demo) — yol kenarinda birikinti var.',
    (select v from t_ids where k='need'), (select v from t_ids where k='loc'),
    'Merkez civari', 'Test Kisi', 'saha48@afethub.test', '');
  insert into t_upd values ('a', v_id);
end $$;

select pg_temp.expect(
  (select status from operation_updates where id = (select v from t_upd where k='a'))::text
    = 'moderation_pending',
  'misafir gönderimi moderasyon bekliyor');
select pg_temp.expect(
  (select count(*) from operation_update_events_public
    where update_id = (select v from t_upd where k='a')) = 0,
  'moderasyon bekleyen kayıt HİÇBİR olay üretmiyor');
select pg_temp.expect(
  (select count(*) from operation_updates_public
    where id = (select v from t_upd where k='a')) = 0,
  'moderasyon bekleyen kayıt herkese açık görünümde YOK');
select pg_temp.expect(
  (select count(*) from list_operation_updates_public((select v from t_ids where k='dis'))) = 0,
  'herkese açık liste moderasyon bekleyen kaydı vermiyor');

-- İletişim bilgisi ANA tabloda değil, ayrı tabloda.
select pg_temp.expect(
  (select count(*) from operation_update_contacts
    where operation_update_id = (select v from t_upd where k='a')) = 1,
  'iletişim bilgisi ayrı tabloda');

-- ---------- 5) Yayınlama olayı ------------------------------------------------
select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', (select v from t_ids where k='coord')), true);
select moderate_operation_update((select v from t_upd where k='a'), 'publish', '');

select pg_temp.expect(
  (select count(*) from operation_update_events_public
    where update_id = (select v from t_upd where k='a') and event_type = 'published') = 1,
  'yayınlama tam olarak bir `published` olayı üretti');
select pg_temp.expect(
  (select count(*) from operation_updates_public where id = (select v from t_upd where k='a')) = 1,
  'yayımlanan kayıt herkese açık görünümde');

-- Olay satırı gövdenin hiçbir parçasını taşımıyor.
select pg_temp.expect(
  (select count(*) from operation_update_events_public e
    where e.update_id = (select v from t_upd where k='a')
      and e::text like '%birikinti%') = 0,
  'olay satırı gövde metnini TAŞIMIYOR');
select pg_temp.expect(
  (select count(*) from operation_update_events_public e
    where e.update_id = (select v from t_upd where k='a')
      and (e::text like '%afethub.test%' or e::text like '%Test Kisi%')) = 0,
  'olay satırı kişisel veri TAŞIMIYOR');

-- Tekrar yayınlama ikinci olay üretmemeli: durum zaten `published`.
select moderate_operation_update((select v from t_upd where k='a'), 'publish', '');
select pg_temp.expect(
  (select count(*) from operation_update_events_public
    where update_id = (select v from t_upd where k='a') and event_type = 'published') = 1,
  'tekrar yayınlama İKİNCİ `published` olayı üretmiyor');

-- ---------- 6) Sabitleme ve sabitleme kaldırma --------------------------------
select pin_operation_update((select v from t_upd where k='a'), true, now() + interval '24 hours');
select pg_temp.expect(
  (select count(*) from operation_update_events_public
    where update_id = (select v from t_upd where k='a') and event_type = 'pinned') = 1,
  'sabitleme `pinned` olayı üretti');
select pg_temp.expect(
  (select count(*) from list_pinned_operation_updates((select v from t_ids where k='dis'))) = 1,
  'sabit kayıt sabit listesinde');
select pg_temp.expect(
  (select count(*) from list_operation_updates_public((select v from t_ids where k='dis'))) = 0,
  'sabit kayıt normal akışta İKİNCİ KEZ görünmüyor');

-- Aynı sabitlemeyi tekrar yazmak yeni olay üretmemeli.
select pin_operation_update((select v from t_upd where k='a'), true, null);
select pin_operation_update((select v from t_upd where k='a'), false, null);
select pg_temp.expect(
  (select count(*) from operation_update_events_public
    where update_id = (select v from t_upd where k='a') and event_type = 'unpinned') = 1,
  'sabitlemeyi kaldırma `unpinned` olayı üretti');
select pg_temp.expect(
  (select count(*) from list_operation_updates_public((select v from t_ids where k='dis'))) = 1,
  'sabitleme kalkınca kayıt normal akışa döndü');

-- ---------- 7) Düzeltme -------------------------------------------------------
-- `correct_operation_update` YENİ bir kayıt açıp eskisini `corrected` durumuna
-- alıyor. İstemci açısından iki olay gerekiyor: yeni kart gelsin (`corrected`),
-- eski kart düşsün (`hidden`).
do $$
declare v_new uuid;
begin
  v_new := correct_operation_update((select v from t_upd where k='a'),
    'Duzeltilmis metin: birikinti temizlendi.', 'Ilk bilgi eksikti');
  insert into t_upd values ('duzeltme', v_new);
end $$;

select pg_temp.expect(
  (select count(*) from operation_update_events_public
    where update_id = (select v from t_upd where k='duzeltme') and event_type = 'corrected') = 1,
  'düzeltme kaydı `corrected` olayı üretti');
select pg_temp.expect(
  (select count(*) from operation_update_events_public
    where update_id = (select v from t_upd where k='a') and event_type = 'hidden') = 1,
  'düzeltilen eski kayıt `hidden` olayı üretti');
select pg_temp.expect(
  (select corrects_update_id from operation_updates_public
    where id = (select v from t_upd where k='duzeltme')) = (select v from t_upd where k='a'),
  'düzeltme kaydı hangi kaydı düzelttiğini taşıyor');
select pg_temp.expect(
  (select count(*) from operation_updates_public where id = (select v from t_upd where k='a')) = 0,
  'düzeltilen eski kayıt herkese açık görünümden çıktı');
select pg_temp.expect(
  (select body from operation_updates where id = (select v from t_upd where k='a'))
    like '%birikinti var%',
  'kullanıcının ORİJİNAL metni korundu');

-- ---------- 8) Gizleme --------------------------------------------------------
select moderate_operation_update((select v from t_upd where k='duzeltme'), 'hide', 'Test gizleme');
select pg_temp.expect(
  (select count(*) from operation_update_events_public
    where update_id = (select v from t_upd where k='duzeltme') and event_type = 'hidden') = 1,
  'gizleme `hidden` olayı üretti');
select pg_temp.expect(
  (select count(*) from operation_updates_public where id = (select v from t_upd where k='duzeltme')) = 0,
  'gizlenen kayıt herkese açık görünümden çıktı');
select pg_temp.expect(
  (select count(*) from operation_updates where id = (select v from t_upd where k='duzeltme')) = 1,
  'gizlenen kayıt SİLİNMEDİ');

-- ---------- 9) Sabitleme limiti ----------------------------------------------
do $$
declare v_id uuid; i integer;
begin
  for i in 1..4 loop
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    v_id := submit_operation_update(
      (select v from t_ids where k='dis'), 'field_report',
      'Ornek saha bildirimi (demo) numara ' || i || ' — sabitleme limiti testi.',
      null, null, '', 'Test Kisi', 'limit' || i || '@afethub.test', '');
    perform set_config('request.jwt.claims',
      format('{"sub":"%s","role":"authenticated"}', (select v from t_ids where k='coord')), true);
    perform moderate_operation_update(v_id, 'publish', '');
    insert into t_upd values ('p' || i, v_id);
  end loop;
end $$;

select pin_operation_update((select v from t_upd where k='p1'), true, null);
select pin_operation_update((select v from t_upd where k='p2'), true, null);
select pin_operation_update((select v from t_upd where k='p3'), true, null);
select pg_temp.expect_error(
  format('select pin_operation_update(%L, true, null)', (select v from t_upd where k='p4')),
  'dördüncü sabitleme REDDEDİLİYOR (limit 3)');
select pg_temp.expect(
  (select count(*) from list_pinned_operation_updates((select v from t_ids where k='dis'))) = 3,
  'sabit listesi en fazla üç kayıt veriyor');

-- Süresi geçmiş bir sabitleme limiti DOLDURMUYOR.
update operation_updates set pinned_until = now() - interval '1 hour'
 where id = (select v from t_upd where k='p1');
select pin_operation_update((select v from t_upd where k='p4'), true, null);
select pg_temp.expect(
  operation_update_pin_is_active(true, now() - interval '1 hour') = false,
  'süresi geçmiş sabitleme AKTİF sayılmıyor');
select pg_temp.expect(
  (select count(*) from list_pinned_operation_updates((select v from t_ids where k='dis'))) = 3,
  'süresi geçen sabitleme sabit listesinden düştü, yerine yenisi girdi');

-- ---------- 10) Süresi geçen sabitlemeyi zamanlayıcı kaldırıyor --------------
select pg_temp.expect(expire_operation_update_pins_system() = 1,
  'zamanlayıcı süresi geçmiş bir sabitlemeyi kaldırdı');
select pg_temp.expect(
  (select is_pinned from operation_updates where id = (select v from t_upd where k='p1')) = false,
  'süresi geçen kaydın sabitlemesi kapandı');
select pg_temp.expect(
  (select count(*) from operation_update_events_public
    where update_id = (select v from t_upd where k='p1') and event_type = 'unpinned') = 1,
  'zamanlayıcı `unpinned` olayı üretti');
select pg_temp.expect(expire_operation_update_pins_system() = 0,
  'ikinci koşu hiçbir kaydı etkilemiyor');
select pg_temp.expect(
  not has_function_privilege('anon', 'expire_operation_update_pins_system()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'expire_operation_update_pins_system()', 'EXECUTE'),
  'sabitleme zamanlayıcısı istemci rollerine KAPALI');

-- ---------- 11) Cursor sayfalaması --------------------------------------------
select pg_temp.expect(
  (select count(*) from list_operation_updates_public(
      (select v from t_ids where k='dis2'))) = 0,
  'başka operasyonun akışı bu operasyondan kayıt SIZDIRMIYOR');

create temporary table t_page1 as
  select * from list_operation_updates_public((select v from t_ids where k='dis'), null, null, null, 1);
select pg_temp.expect((select count(*) from t_page1) = 1, 'sayfa boyutu uygulanıyor');

create temporary table t_page2 as
  select * from list_operation_updates_public(
    (select v from t_ids where k='dis'), null,
    (select published_at from t_page1), (select id from t_page1), 1);
select pg_temp.expect(
  (select count(*) from t_page2) <= 1
  and not exists (select 1 from t_page2 where id in (select id from t_page1)),
  'ikinci sayfa birinci sayfanın kaydını TEKRARLAMIYOR');

select pg_temp.expect(
  (select count(*) from list_operation_updates_public(
      (select v from t_ids where k='dis'), 'safety_notice')) = 0,
  'tür süzgeci sunucuda uygulanıyor');
select pg_temp.expect(
  (select count(*) from list_operation_updates_public(
      (select v from t_ids where k='dis'), null, null, null, 999)) <= 50,
  'sayfa boyutu üst sınırı zorlanıyor');

-- ---------- 12) Herkese açık görünüm sızıntısı --------------------------------
select pg_temp.expect(
  not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='operation_updates_public'
       and column_name in ('author_user_id','moderated_by','moderation_reason','pii_flagged','status')),
  'herkese açık görünüm iç alanları taşımıyor');
select pg_temp.expect(
  (select count(*) from operation_media_public m
     join operation_updates u on u.id = m.operation_update_id
    where u.status <> 'published') = 0,
  'yayımlanmamış kaydın medyası herkese açık galeride YOK');

-- ---------- 13) Denetim kayıtları herkese açık akışa düşmüyor ----------------
select pg_temp.expect(
  (select count(*) from audit_log_public
    where action in ('Saha güncellemesi sabitlendi','Saha güncellemesi sabitlemesi kaldırıldı',
                     'Saha güncellemesi gizlendi','Saha güncellemesi düzeltildi')) = 0,
  'saha güncellemesi moderasyon eylemleri herkese açık akışta YOK');

rollback;
