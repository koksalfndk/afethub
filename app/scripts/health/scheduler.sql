-- Zamanlanmış işler (migration 0046)
--
-- Bir zamanlayıcının en tehlikeli hâli, kurulmuş görünüp sessizce çalışmamasıdır:
-- "Süresi Dolan" görünümü boş kaldığında bunun "hiç geciken söz yok" mu yoksa
-- "iş hiç çalışmadı" mı olduğu ayırt edilemez. Bu dosya farkı raporluyor.
select 'süre dolumu zamanlanmış işi YOK' as kontrol,
       case when exists (select 1 from cron.job where jobname = 'expire-stale-pledges')
            then 0 else 1 end as bulgu,
       'cron.job içinde expire-stale-pledges bulunamadı' as ornek
union all
select 'süre dolumu işi PASİF',
       count(*), string_agg(schedule, ' | ')
from cron.job where jobname = 'expire-stale-pledges' and not active
union all
-- Son 24 saatte hiç çalışmamışsa ya iş pasif ya da pg_cron ayakta değil.
select 'süre dolumu işi son 24 saatte hiç çalışmadı',
       case when exists (select 1 from cron.job where jobname = 'expire-stale-pledges')
             and not exists (
               select 1 from cron.job_run_details d
                 join cron.job j on j.jobid = d.jobid
                where j.jobname = 'expire-stale-pledges'
                  and d.start_time > now() - interval '24 hours')
            then 1 else 0 end,
       'cron.job_run_details son 24 saatte kayıt taşımıyor'
union all
select 'süre dolumu işinin son koşusu BAŞARISIZ',
       count(*), string_agg(coalesce(d.return_message, '—'), ' | ')
from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
where j.jobname = 'expire-stale-pledges'
  and d.status not in ('succeeded', 'running')
  and d.start_time > now() - interval '24 hours'
union all
-- Zamanlayıcı çalışıyorsa bu sayı sıfır olmalı: payı çoktan geçmiş ama hâlâ
-- açık duran söz kalmamalı. Sıfırdan farklıysa iş çalışmıyor ya da kilitte.
select 'payı geçtiği hâlde hâlâ açık duran söz',
       count(*), string_agg(public_tracking_code, ' | ')
from delivery_pledges
where status in ('pledged', 'confirmed')
  and estimated_delivery_at is not null
  and estimated_delivery_at < now() - interval '49 hours'
union all
-- Zamanlayıcı girişi hiçbir istemci rolüne açık olmamalı.
select 'zamanlayıcı fonksiyonu istemci rolüne AÇIK',
       count(*), string_agg(grantee || ' → ' || routine_name, ' | ')
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in ('expire_stale_pledges_system', 'expire_stale_pledges_core')
  and grantee in ('anon', 'authenticated', 'PUBLIC');
