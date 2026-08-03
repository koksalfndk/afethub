-- Teslim sözü operasyon kuralları (migration 0044)
select 'durum makinesi eksik veya gevşek' as kontrol,
       case when not exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname='public' and p.proname='pledge_transition_allowed')
       then 1 else 0 end as bulgu,
       'pledge_transition_allowed() bulunamadı' as ornek
union all
-- Bir bildirim en fazla bir söze bağlanabilir; kısıt veritabanında olmalı.
select 'bildirim başına tek söz kısıtı yok',
       case when not exists (
         select 1 from pg_indexes
          where schemaname='public' and indexname='delivery_pledges_submission_uidx')
       then 1 else 0 end,
       'delivery_pledges_submission_uidx bulunamadı'
union all
select 'aynı bildirime bağlı birden fazla söz',
       count(*),
       string_agg(submission_id::text, ', ')
from (select submission_id from delivery_pledges
       where submission_id is not null
       group by submission_id having count(*) > 1) x
union all
-- `fulfilled` yalnızca doğrulanmış bir teslimatın SONUCU olabilir.
select 'bağlı bildirimi olmayan fulfilled kayıt',
       count(*), string_agg(public_tracking_code, ', ')
from delivery_pledges where status = 'fulfilled' and submission_id is null
union all
select 'kapalı olduğu hâlde bildirime bağlı kayıt',
       count(*), string_agg(public_tracking_code, ', ')
from delivery_pledges
where status in ('cancelled','expired') and submission_id is not null
union all
-- Söz ile ihtiyaç aynı operasyonda olmalı.
select 'çapraz operasyon: söz / ihtiyaç',
       count(*), string_agg(p.public_tracking_code, ', ')
from delivery_pledges p join needs n on n.id = p.need_id
where p.disaster_id <> n.disaster_id;
