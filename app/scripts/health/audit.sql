-- Hangi eylem herkese açık, hangisi özel? Tablo halinde; karar değil, ölçüm.
with acts as (select distinct action from audit_log),
     pub  as (select distinct action from audit_log_public)
select a.action,
       case when p.action is not null then 'HERKESE ACIK' else 'ozel' end as gorunurluk,
       (select count(*) from audit_log x where x.action = a.action) as kayit
from acts a left join pub p on p.action = a.action
order by 2 desc, 1;
