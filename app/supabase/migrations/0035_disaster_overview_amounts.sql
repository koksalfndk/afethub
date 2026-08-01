-- AfetHUB — migration 0035
-- `disaster_overview` görünümüne operasyon başına MİKTAR toplamları.
--
-- Neden gerekiyor: yeni ana sayfa her afet kartında dört sayıyı ayrı ayrı yazıyor —
-- talep edilen, onaylanan, doğrulama bekleyen, kalan. Görünüm bugün yalnızca ADET
-- veriyor (kaç ihtiyaç açık, kaç teslimat bekliyor); miktarların kendisi yok.
--
-- Tarayıcıda toplamak bir seçenek değildi. `needs` tablosunun tamamı zaten istemciye
-- iniyor, yani teknik olarak mümkün — ama CLAUDE.md §Source of Truth "yetkili toplamlar
-- yalnızca tarayıcıda hesaplanmaz" diyor ve bu sayılar ekranda tam olarak yetkili
-- sayılar gibi okunacak. Aynı toplam iki ekranda iki farklı yoldan hesaplanırsa er ya
-- da geç ikisi ayrışır; kaynak tek olsun.
--
-- Kanonik kural aynen korunuyor (rules/02):
--     kalan = max(talep edilen - onaylanan, 0)
-- Bekleyen miktar kalandan DÜŞÜLMEZ; ayrı sütun olarak durur ve ekranda da ayrı yazılır.
--
-- `remaining_total` doğrudan needs.remaining_qty toplamı olarak alınıyor, yeniden
-- hesaplanarak değil: o sütun onay işleminin kendisi tarafından işlem içinde yazılıyor
-- ve tek doğru değer o. Burada tekrar `required - verified` yazmak, aynı gerçeği ikinci
-- bir formülle üretmek olurdu — tam da yukarıda kaçınılan hata.
--
-- BEKLEYEN MİKTAR için `needs.pending_qty` BİLEREK kullanılmadı; mevcut `pending_units`
-- (bekleyen teslimatların toplamı) olduğu gibi bırakıldı. Sebebi ölçüldü: bu veritabanında
-- `needs.pending_qty` toplamı binlerce birim gösterirken 'Pending verification' durumunda
-- TEK BİR teslimat yok. Yani o sütun demo tohum verisiyle doldurulmuş ve hiçbir kayda
-- dayanmıyor. Herkese açık bir ekranda arkasında kaydı olmayan bir "doğrulama bekliyor"
-- sayısı yazmak, platformun tek iddiasını — her sayının bir kaydı vardır — çürütürdü.
--
-- Görünüm `create or replace` ile bütün sütun listesiyle yeniden yazılıyor (0028 ve
-- 0029 ile aynı desen); Postgres bir görünümün sütun listesini yerinde genişletmiyor.
-- Additive ve idempotent: mevcut sütunların adı, sırası ve anlamı değişmedi.
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
  d.districts,
  d.settlements,
  -- ---- Miktar toplamları (yeni) ------------------------------------------
  -- SONA ekleniyor, araya değil: `create or replace view` bir görünümün sütun
  -- listesine ortadan ekleme yapamaz, mevcut sütunu yeniden adlandırmaya çalışır
  -- ve "cannot change name of view column" ile durur. Yeni sütunun yeri her zaman
  -- listenin sonudur.
  --
  -- Yalnızca AÇIK ihtiyaçlar üzerinden değil, operasyonun TAMAMI üzerinden:
  -- tamamlanan bir ihtiyacın talep ve onay miktarı da operasyonun hikâyesinin
  -- parçası. Kapanan kalemleri toplamdan düşürmek, "ne kadarı karşılandı"
  -- sorusunu her kapanışta geriye doğru yanlışlardı.
  (select coalesce(sum(n.required_qty), 0) from needs n
     where n.disaster_id = d.id)                                                as required_total,
  (select coalesce(sum(n.verified_qty), 0) from needs n
     where n.disaster_id = d.id)                                                as verified_total,
  (select coalesce(sum(n.remaining_qty), 0) from needs n
     where n.disaster_id = d.id)                                                as remaining_total
from disasters d;

grant select on disaster_overview to anon, authenticated;

comment on view disaster_overview is
  'Public projection of an operation. Amount columns follow rules/02: remaining = max(required - verified, 0), and pending_units is never subtracted from remaining.';

-- Şema değişti: PostgREST önbelleği tazelenmezse yeni alanlar API yanıtında görünmez.
notify pgrst, 'reload schema';
