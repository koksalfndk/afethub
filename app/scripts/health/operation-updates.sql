-- Saha güncellemeleri kuyruğu (migration 0038/0049/0050)
--
-- Kuyruğun en tehlikeli hâli sessizce birikmesi: kimsenin açmadığı bir moderasyon
-- ekranında bekleyen gönderi, yazan kişi için "kayboldu" demek. Bu dosya birikmeyi
-- ve tutarsızlığı raporluyor. Bekleme eşikleri operasyonel uyarıdır (bulgu > 0
-- incelenmeli), şema satırları ise her koşulda 0 olmalıdır.
--
--   psql "$DATABASE_URL" -f scripts/health/operation-updates.sql

-- 24 saatten uzun bekleyen gönderi: moderasyon fiilen durmuş olabilir.
select '24 saatten uzun bekleyen gönderi' as kontrol,
       count(*) as bulgu,
       string_agg(left(id::text, 8), ' | ') as ornek
from operation_updates
where status = 'moderation_pending'
  and created_at < now() - interval '24 hours'
union all
-- Bilgi istendi ama 72 saattir karar yok: gönderene kimse dönmemiş olabilir
-- (bildirim motoru Faz 4-B'ye kadar elle işletiliyor — bu satır o elin unutulmadığını ölçer).
select 'bilgi isteği 72 saattir açık',
       count(*), string_agg(left(id::text, 8), ' | ')
from operation_updates
where status = 'moderation_pending'
  and info_requested_at is not null
  and info_requested_at < now() - interval '72 hours'
union all
-- 24 saatten uzun bekleyen fotoğraf.
select '24 saatten uzun bekleyen fotoğraf',
       count(*), string_agg(left(a.id::text, 8), ' | ')
from operation_update_attachments a
where a.moderation_status = 'pending'
  and a.created_at < now() - interval '24 hours'
union all
-- Açık topluluk bildirimi 48 saattir duruyor.
select 'topluluk bildirimi 48 saattir açık',
       count(*), string_agg(left(r.id::text, 8), ' | ')
from operation_update_reports r
where r.status = 'open'
  and r.created_at < now() - interval '48 hours'
union all
-- ---- Şema/tutarlılık: her koşulda 0 -----------------------------------------
-- Yayımlanmamış güncellemenin eki galeride olamaz (0038 görünüm koşulu; bu satır
-- görünümün bozulmadığını değil, BOZULURSA görüneceğini garanti eder).
select 'yayımlanmamış güncellemenin eki galeride',
       count(*), string_agg(left(m.id::text, 8), ' | ')
from operation_media_public m
join operation_updates u on u.id = m.operation_update_id
where u.status <> 'published'
union all
-- Bekleyen/reddedilen ek galeride olamaz.
select 'onaysız ek galeride',
       count(*), string_agg(left(m.id::text, 8), ' | ')
from operation_media_public m
join operation_update_attachments a on a.id = m.id
where a.moderation_status <> 'approved'
union all
-- Karar verilmiş kayıtta açık bilgi isteği kalmamalı (0049 moderasyonu temizler).
select 'karar verilmiş kayıtta açık bilgi isteği',
       count(*), string_agg(left(id::text, 8), ' | ')
from operation_updates
where status <> 'moderation_pending' and info_requested_at is not null
union all
-- Gizlenen/reddedilen kayıt public view'a sızamaz.
select 'yayımda olmayan kayıt public görünümde',
       count(*), string_agg(left(p.id::text, 8), ' | ')
from operation_updates_public p
join operation_updates u on u.id = p.id
where u.status <> 'published'
union all
-- 4 fotoğraf sınırı (register_update_attachment) delinmiş mi.
select 'bir güncellemede 4''ten çok ek',
       count(*), string_agg(left(operation_update_id::text, 8), ' | ')
from (
  select operation_update_id
  from operation_update_attachments
  group by operation_update_id
  having count(*) > 4
) fazla;
