-- Herkese açık yüzeyde kişisel veri veya takip kodu var mı
-- Takip kodu taraması iki katmanlı: bilinen önekler VE genel kod şekli
-- ("büyük harfli önek + tire + alfanümerik"). İkincisi, bugün var olmayan bir
-- önek eklendiğinde kontrolün sessizce körelmemesi için (migration 0045 ile aynı
-- kural). `detail`, `old_value` ve `new_value` birlikte taranıyor.
select 'herkese açık denetim akışında takip kodu' as kontrol,
       count(*) as bulgu,
       string_agg(left(detail, 40), ' | ') as ornek
from audit_log_public
where detail    ~ '(SOZ|AFT|NRQ)-[A-Z0-9]+'
   or old_value ~ '(SOZ|AFT|NRQ)-[A-Z0-9]+'
   or new_value ~ '(SOZ|AFT|NRQ)-[A-Z0-9]+'
union all
select 'herkese açık akışta kod ŞEKLİNDE metin (bilinmeyen önek dahil)',
       count(*), string_agg(left(detail, 40), ' | ')
from audit_log_public
where detail    ~ '\m[A-Z]{2,6}-[A-Z0-9]{3,}\M'
   or old_value ~ '\m[A-Z]{2,6}-[A-Z0-9]{3,}\M'
   or new_value ~ '\m[A-Z]{2,6}-[A-Z0-9]{3,}\M'
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
-- Maskeli biçim "Köksal F." — soyadı tek harf ve nokta. Bunu bulgu sayan ilk
-- sürüm 17 yanlış pozitif üretti. Kontrol artık NOKTA İLE BİTMEYEN ve iki
-- harften uzun ikinci kelimeyi arıyor: yani gerçekten açık bir soyadı.
select 'herkese açık akışta maskelenmemiş aktör (açık soyadı)',
       count(*), string_agg(distinct actor, ' | ')
from audit_log_public
where actor ~ '^[^ ]+ [^ .]{3,}$'
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
