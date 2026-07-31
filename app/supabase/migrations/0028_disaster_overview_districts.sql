-- AfetHUB — migration 0028
-- `disaster_overview` görünümüne `districts` eklendi.
--
-- HATA DÜZELTMESİ. 0026 sütunu `disasters` TABLOSUNA ekledi, ama uygulama afet
-- kaydını tablodan değil bu GÖRÜNÜMDEN okuyor (gönüllü sayıları orada türetiliyor,
-- bkz. supabaseRepo.getSnapshot). Görünümde olmayan bir sütun hata vermez —
-- sessizce null gelir, istemci de boş diziye çevirir. Sonuç: ilçeler veritabanında
-- dolu olduğu hâlde afet detay sayfası "ilçe kaydedilmemiş" diyordu ve ilçe
-- haritası hiç çizilmiyordu.
--
-- Migration 0011 tam olarak bu tuzağı yazıyordu ("tabloda olup görünümde olmayan
-- bir sütun sessizce null'a düşer, operasyon hangi sorgunun yüklediğine göre veri
-- kaybeder"); 0026 yazılırken gözden kaçtı.
--
-- KURAL: `disasters` tablosuna eklenen ve arayüzde görünecek her alan için bu
-- görünüm de aynı migration içinde güncellenmeli.
--
-- Sütun SONA ekleniyor: `create or replace view` yalnızca kuyruğa kolon eklemeye
-- izin verir; araya eklemek `drop view` + `create view` gerektirir (0005'te yaşandı).
-- =============================================================================

create or replace view disaster_overview as
select
  d.id, d.slug, d.name, d.region, d.province, d.type, d.status,
  d.opened_at, d.updated_at, d.volunteers, d.on_shift, d.is_demo,
  (select count(*) from needs n
     where n.disaster_id = d.id and n.remaining_qty > 0)                        as active_needs,
  (select count(*) from needs n
     where n.disaster_id = d.id and n.remaining_qty = 0)                        as completed_needs,
  (select count(*) from submissions s
     where s.disaster_id = d.id and s.status = 'Pending verification')          as pending_submissions,
  (select coalesce(sum(s.qty), 0) from submissions s
     where s.disaster_id = d.id and s.status = 'Pending verification')          as pending_units,
  (select count(*) from submissions s
     where s.disaster_id = d.id
       and s.status in ('Verified','Partially verified'))                       as verified_submissions,
  (select count(*) from locations l where l.disaster_id = d.id)                 as delivery_points,
  d.situation,
  d.legacy_slugs,
  d.opened_by_org_id,
  d.opened_by_community,
  d.community_confirmed_at,
  d.districts
from disasters d;

grant select on disaster_overview to anon, authenticated;
