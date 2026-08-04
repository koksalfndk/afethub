-- Realtime yüzeyi (migration 0048/0049)
--
-- Buradaki tehlike sessiz genişleme: bir gün biri base tabloyu publication'a
-- ekler ya da olay tablosuna içerik sütunu koyar ve hiçbir şey KIRILMAZ —
-- yalnızca moderasyon bekleyen metinler ve kişisel veriler WebSocket'ten akmaya
-- başlar. Bu dosya o genişlemeyi raporluyor. Her satırda bulgu = 0 beklenir.
--
--   psql "$DATABASE_URL" -f scripts/health/realtime.sql

select 'olay tablosu publication''da DEĞİL' as kontrol,
       case when exists (select 1 from pg_publication_tables
                          where pubname = 'supabase_realtime' and schemaname = 'public'
                            and tablename = 'operation_update_events_public')
            then 0 else 1 end as bulgu,
       'pg_publication_tables içinde operation_update_events_public yok' as ornek
union all
-- 0048'in varlık sebebi: base tablolar Realtime'a HİÇ görünmez.
select 'BASE TABLO publication''a sızmış',
       count(*), string_agg(tablename, ' | ')
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
  and tablename in ('operation_updates', 'operation_update_contacts',
                    'operation_update_attachments', 'operation_update_reports')
union all
-- Olay tablosu içerik/kimlik sütunu kazanmış mı? (7 sütun: id, update_id,
-- disaster_id, event_type, update_type, is_pinned, occurred_at)
select 'olay tablosuna İÇERİK sütunu eklenmiş',
       count(*), string_agg(column_name, ' | ')
from information_schema.columns
where table_schema = 'public' and table_name = 'operation_update_events_public'
  and column_name not in ('id', 'update_id', 'disaster_id', 'event_type',
                          'update_type', 'is_pinned', 'occurred_at')
union all
select 'istemci rolleri olay tablosuna YAZABİLİYOR',
       (has_table_privilege('anon', 'operation_update_events_public', 'INSERT')::int
        + has_table_privilege('anon', 'operation_update_events_public', 'UPDATE')::int
        + has_table_privilege('anon', 'operation_update_events_public', 'DELETE')::int
        + has_table_privilege('authenticated', 'operation_update_events_public', 'INSERT')::int
        + has_table_privilege('authenticated', 'operation_update_events_public', 'UPDATE')::int
        + has_table_privilege('authenticated', 'operation_update_events_public', 'DELETE')::int),
       'anon/authenticated için INSERT/UPDATE/DELETE izni bulundu'
union all
select 'anon olay tablosunu OKUYAMIYOR (abonelik çalışmaz)',
       case when has_table_privilege('anon', 'operation_update_events_public', 'SELECT')
            then 0 else 1 end,
       'anon SELECT izni kaldırılmış'
union all
-- Tetikleyici düşerse akış sessizce ölür: yayın yapılır ama olay üretilmez.
select 'olay üretici tetikleyici YOK ya da pasif',
       case when exists (
              select 1 from pg_trigger t
                join pg_class c on c.oid = t.tgrelid
               where c.relname = 'operation_updates'
                 and t.tgfoid = 'emit_operation_update_event()'::regprocedure
                 and t.tgenabled <> 'D')
            then 0 else 1 end,
       'operation_updates üzerinde emit_operation_update_event tetikleyicisi aktif değil'
union all
-- Yayımlanmış her güncellemenin en az bir `published` olayı olmalı (0048 sonrası).
-- Olaysız yayın, tetikleyicinin bir dönem devre dışı kaldığının izi.
select 'olaysız YAYIN var (0048 sonrası)',
       count(*), string_agg(left(u.id::text, 8), ' | ')
from operation_updates u
where u.status = 'published'
  and u.published_at > (select min(occurred_at) from operation_update_events_public)
  and not exists (select 1 from operation_update_events_public e
                   where e.update_id = u.id and e.event_type = 'published')
union all
-- Sabit uyarı süresi dolduğunda cron temizliyor (0048); iş kaybolmuşsa süresi
-- geçmiş sabitler ekranda kalır.
select 'sabit süre dolumu cron işi YOK',
       case when exists (select 1 from cron.job where jobname = 'expire-operation-update-pins')
            then 0 else 1 end,
       'cron.job içinde expire-operation-update-pins bulunamadı';
