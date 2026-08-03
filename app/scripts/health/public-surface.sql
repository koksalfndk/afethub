-- Herkese açık yüzeyde kişisel veri veya takip kodu var mı
select 'herkese açık denetim akışında takip kodu' as kontrol,
       count(*) as bulgu,
       string_agg(left(detail, 40), ' | ') as ornek
from audit_log_public
where detail ~ '(SOZ|AFT|NRQ)-[A-Z0-9]+'
union all
select 'herkese açık denetim akışında e-posta',
       count(*), string_agg(left(detail, 40), ' | ')
from audit_log_public
where detail ~ '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}'
union all
select 'herkese açık denetim akışında telefon',
       count(*), string_agg(left(detail, 40), ' | ')
from audit_log_public
where detail ~ '(\+?90|0)?[[:space:]]?5[0-9]{2}[[:space:]]?[0-9]{3}'
union all
select 'herkese açık akışta maskelenmemiş aktör (iki kelimeli tam ad)',
       count(*), string_agg(distinct actor, ' | ')
from audit_log_public
where actor ~ '^[^ ]+ [^ ]{2,}$'
union all
-- Teslim sözü eylemleri herkese açık akışa DÜŞMEMELİ (direktif §28).
select 'herkese açık akışta teslim sözü eylemi',
       count(*), string_agg(distinct action, ' | ')
from audit_log_public
where action like 'Teslim sözü%'
union all
-- Operasyon aşaması gerekçesi iç bilgidir; 0039 bunu boşaltıyor.
select 'herkese açık akışta aşama gerekçesi',
       count(*), string_agg(left(detail, 40), ' | ')
from audit_log_public
where action = 'Operasyon aşaması güncellendi' and coalesce(detail,'') <> '';
