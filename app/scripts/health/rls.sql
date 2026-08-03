-- RLS durumu ve politikası olmayan komut izinleri
select 'RLS kapalı tablo' as kontrol,
       count(*) as bulgu,
       string_agg(c.relname, ', ') as ornek
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
-- Politikası olmayan bir komutun izni RLS tarafından zaten reddediliyor; izni
-- bırakmak yalnızca yüzey büyütür.
select 'politikası olmadığı hâlde izni duran komut',
       count(*),
       string_agg(g.table_name || ':' || g.privilege_type, ', ')
from information_schema.role_table_grants g
join pg_class c on c.relname = g.table_name
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where g.table_schema = 'public'
  and g.grantee in ('anon','authenticated')
  and g.privilege_type in ('INSERT','UPDATE','DELETE')
  and c.relkind = 'r' and c.relrowsecurity
  and not exists (
    select 1 from pg_policies p
     where p.schemaname = 'public' and p.tablename = g.table_name
       and (p.cmd = g.privilege_type or p.cmd = 'ALL')
  );
