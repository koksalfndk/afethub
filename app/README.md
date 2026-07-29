# AfetHUB — web uygulaması

Seydikemer Orman Yangını senaryosuyla AfetHUB afet yardım koordinasyon
platformunun React + Vite + TypeScript uygulaması. Onaylanan tasarım
(`AfetHUB.dc.html`) birebir hayata geçirildi; arayüz Türkçe.

## Çalıştırma

```bash
npm install
npm run dev
```

Uygulama iki veri modunda çalışır:

- **Yerel (varsayılan):** `.env` yoksa ya da boşsa, tüm veri bellek içi seed'den
  gelir. Bütün etkileşimler çalışır (teslimat bildir, doğrula, kısmi/ret,
  ihtiyaç yayınla, takip). Sayfa yenilenince sıfırlanır. Backend gerekmez.
- **Canlı Supabase:** `.env` içinde proje bilgileri varsa uygulama gerçek
  Supabase projesine bağlanır. Şema henüz uygulanmadıysa otomatik olarak yerel
  seed'e düşer, böylece arayüz asla boş kalmaz.

## Supabase'i canlıya alma

1. `.env` dosyasını doldur (örnek için `.env.example`):

   ```
   VITE_SUPABASE_URL=https://<proje>.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_...
   ```

2. Supabase projenin **SQL editöründe** sırasıyla çalıştır:
   - `supabase/schema.sql` — tablolar, enumlar, RLS politikaları, değiştirilemez
     denetim kaydı ve transaksiyonel `verify_submission` fonksiyonu.
   - `supabase/seed.sql` — Seydikemer senaryosu (Türkçe içerik).

3. `npm run dev` — uygulama artık canlı veriyle çalışır.

> Not: publishable/anon anahtar istemci tarafında bulunur; veriyi koruyan şey
> **Row-Level Security**'dir (`schema.sql`).

## Temel kural (her katmanda geçerli)

    Kalan = Gerekli − Doğrulanan     (asla 0'ın altına inmez)
    Bekleyen teslimatlar kalanı ASLA düşürmez.

Doğrulanan miktarı yalnızca bir koordinatör onayı artırır. Miktar değiştiren
her işlem transaksiyoneldir ve denetim kaydına yazılır.

## Kimlik doğrulama (sonraki adım)

Prototipteki Ziyaretçi/Koordinatör anahtarı bir **önizleme** anahtarıdır.
Yerel modda tüm koordinatör işlemleri çalışır. Canlı Supabase modunda ise
`schema.sql`'deki RLS gereği koordinatör işlemleri (doğrulama, ihtiyaç
oluşturma) yalnızca **giriş yapmış bir koordinatör** için çalışır; herkese açık
akışlar (ihtiyaçları görüntüleme, teslimat bildirme, takip) kimlik doğrulaması
gerektirmez. Gerçek koordinatör girişi (Supabase Auth + `profiles.role`)
eklenmesi bir sonraki adımdır.

## Yapı

```
src/
  theme.ts            tasarım token'ları (renk, öncelik/durum)
  i18n/strings.ts     tüm Türkçe arayüz metinleri (çeviriye hazır)
  types.ts            alan modeli tipleri
  data/               veri katmanı (repo arayüzü + yerel + Supabase + seçim)
  store.tsx           rota/rol/cihaz durum makinesi ve tüm eylemler
  select.ts, ui.tsx   türetilmiş yardımcılar ve paylaşılan UI parçaları
  components/         Toolbar, Header, Sidebar, BottomNav, Modal, Toast
  screens/            tüm ekranlar (ziyaretçi + koordinatör + referans)
supabase/
  schema.sql          uygulanmaya hazır şema + RLS + fonksiyonlar
  seed.sql            Seydikemer seed verisi
```
