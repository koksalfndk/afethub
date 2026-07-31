-- AfetHUB — migration 0026
-- Operasyonun etkilediği ilçeler.
--
-- Bugüne kadar ilçe yalnızca serbest metin `region` alanının içine gömülüyordu
-- ("Seydikemer, Muğla · Türkiye"). Form değeri zaten topluyordu; kayıp yerdeydi.
-- Afet detay sayfasındaki ilçe haritası bu alan olmadan boyayacak bir şey bulamaz.
--
-- Dizi, tek metin değil: gerçek kayıtlarda "Bozkurt ve İnebolu" gibi BİRDEN ÇOK
-- ilçe var. Tek alan olsaydı ya biri düşerdi ya da harita hiçbirini eşleyemezdi.
--
-- Additive ve idempotent. Hiçbir operasyonel veri silinmiyor.
-- =============================================================================

alter table disasters
  add column if not exists districts text[] not null default '{}';

comment on column disasters.districts is
  'Districts the operation covers. Empty = not recorded; never guessed. Feeds the district map on the operation page.';

-- Geriye doldurma. Tahmin DEĞİL: `region` metnini bu uygulamanın kendi kodu yazdı
-- ("<ilçe>, <il> · Türkiye"), o yüzden kalıp birebir biliniyor. Kalıba uymayan
-- satır BOŞ bırakılır — uymayan bir metinden ilçe adı uydurmak, haritada yanlış
-- ilçeyi boyamak demek olurdu.
--
-- Ayırma kuralı istemcideki `splitDistricts()` ile aynı olmalı (app/src/data/repo.ts):
-- ikisi ayrışırsa aynı metin iki farklı listeye çevrilir.
update disasters d
   set districts = coalesce((
         select array_agg(btrim(x) order by btrim(x))
           from unnest(regexp_split_to_array(split_part(d.region, ',', 1), '\s+ve\s+')) as x
          where btrim(x) <> ''
       ), '{}')
 where d.districts = '{}'
   and d.region like '%, ' || d.province || ' · Türkiye';

-- Not: ilçe adı bir yabancı anahtar değil, serbest metin. Haritada karşılığı
-- bulunamayan ad ekranda sessizce yutulmaz, koordinatöre "eşleşmedi" diye
-- gösterilir — yazım hatası bir kaydı sessizce haritadan düşürmemeli.
