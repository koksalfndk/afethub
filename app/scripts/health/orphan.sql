-- Denetim kaydı ile tablo arasındaki ayrışma.
-- Ayrıntılı sürüm `integrity.sql` içinde; bu dosya yalnızca iki yönü sayıyor.
with audit_codes as (
  select distinct (regexp_match(detail, '(SOZ-[A-Z0-9]+)'))[1] as code
  from audit_log where action like 'Teslim sözü%' and detail ~ 'SOZ-[A-Z0-9]+'
)
select 'denetim kaydı var, teslim sözü YOK' as kontrol,
       count(*) as bulgu,
       string_agg(ac.code, ', ') as ornek
from audit_codes ac
left join delivery_pledges p on p.public_tracking_code = ac.code
where p.id is null
union all
select 'teslim sözü var, oluşturma kaydı YOK',
       count(*), string_agg(p.public_tracking_code, ', ')
from delivery_pledges p
where not exists (
  select 1 from audit_log a
   where a.action = 'Teslim sözü verildi'
     and a.detail like '%' || p.public_tracking_code || '%');
