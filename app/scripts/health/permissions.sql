-- Gereksiz tablo izinleri (Faz 3-B.1'de kapatıldı; kapalı KALMALI)
--
-- TRUNCATE burada özel: RLS'e tabi DEĞİL. Bir kez daha verilirse denetim kaydı
-- yeniden silinebilir hale gelir.
select 'anon/authenticated rolünde TRUNCATE, REFERENCES veya TRIGGER izni' as kontrol,
       count(*) as bulgu,
       string_agg(distinct table_name || ':' || privilege_type, ', ') as ornek
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated')
  and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')
union all
select 'delivery_pledges tablosunda doğrudan erişim izni',
       count(*),
       string_agg(distinct grantee || ':' || privilege_type, ', ')
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'delivery_pledges'
  and grantee in ('anon','authenticated')
union all
select 'audit_log üzerinde yazma izni',
       count(*),
       string_agg(distinct grantee || ':' || privilege_type, ', ')
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'audit_log'
  and grantee in ('anon','authenticated')
  and privilege_type in ('INSERT','UPDATE','DELETE')
union all
select 'needs tablosunda DELETE izni',
       count(*),
       string_agg(distinct grantee, ', ')
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'needs'
  and grantee in ('anon','authenticated') and privilege_type = 'DELETE'
union all
-- Koordinatör RPC'leri anon'a AÇIK OLMAMALI (migration 0044).
select 'koordinatör RPC''si anon''a açık',
       count(*),
       string_agg(p.proname, ', ')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('list_delivery_pledges_for_coordinator','get_delivery_pledge_detail',
                    'get_delivery_pledge_contact','delivery_pledge_summary',
                    'list_linkable_submissions','link_pledge_to_submission_coord',
                    'set_pledge_status',
                    -- Faz 3-D: süre dolumu ve dışa aktarma kaydı
                    'expire_stale_pledges','expire_stale_pledges_system',
                    'expire_stale_pledges_core','log_pledge_export')
  and has_function_privilege('anon', p.oid, 'EXECUTE')
union all
-- Eklenti fonksiyonları HARİÇ: pgcrypto gibi eklentiler kendi fonksiyonlarını
-- getirir, onların search_path'i bizim sorumluluğumuzda değil. (Yerel kabuk
-- veritabanında pgcrypto `public` içinde duruyor ve bu kontrolü ilk sürümde 36
-- yanlış bulguyla doldurmuştu.)
select 'search_path''i sabitlenmemiş fonksiyon',
       count(*), string_agg(p.proname, ', ')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proconfig is null
  and not exists (select 1 from pg_depend d
                   where d.objid = p.oid and d.deptype = 'e');
