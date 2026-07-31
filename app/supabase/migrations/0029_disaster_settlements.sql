-- AfetHUB — migration 0029
-- Operasyonun etkilediği yerleşimler (mahalle / köy).
--
-- `districts` ilçe düzeyini veriyor; bu alan bir kademe aşağısı. Aynı ilçenin 60
-- köyünden üçü etkilendiyse "Seydikemer" demek yardımı ilçenin tamamına yayar.
--
-- Mahalle ve köy TEK dizide: ikisi de yerleşim, ve hangisinin ne olduğu referans
-- listesinden (TurkiyeAPI verisi, MIT) türetilebiliyor. İki ayrı sütun,
-- koordinatörden bilmesi gerekmeyen bir ayrımı yapmasını istemek olurdu.
--
-- Boş = kaydedilmemiş. ASLA "hiçbiri etkilenmedi" anlamına gelmez ve ekranda da
-- öyle gösterilmez — ilçe alanında olduğu gibi (0026) boşken liste hiç çizilmez.
--
-- Görünüm de aynı migration içinde güncelleniyor: 0026'da bu atlanmış, alan
-- `disasters` tablosunda dolu olduğu hâlde uygulama `disaster_overview`'dan
-- okuduğu için sessizce null gelmişti ve 0028 bunu düzeltmek zorunda kaldı.
--
-- Additive ve idempotent.
-- =============================================================================

alter table disasters
  add column if not exists settlements text[] not null default '{}';

comment on column disasters.settlements is
  'Neighbourhoods / villages the operation covers, within `districts`. Empty = not recorded; never means "none affected".';

-- ---------- Görünüm aynı turda güncellenir ----------------------------------
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
  d.districts,
  d.settlements
from disasters d;

grant select on disaster_overview to anon, authenticated;

-- Şema değişti: PostgREST önbelleği tazelenmezse yeni alan API yanıtında görünmez.
notify pgrst, 'reload schema';
