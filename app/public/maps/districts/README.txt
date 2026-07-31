İlçe haritaları — <plaka>.svg
-----------------------------
Her dosya bir ilin ilçelerini taşır: `<path data-district="İLÇE ADI" d="…"/>`.
viewBox il başına farklıdır (kaynak veriden gelir), bu yüzden dosyadan okunur.

Kaynak : turkey-district-maps-3 (npm, MIT) — https://github.com/ritzykey/turkey-district-maps
Üretim : paketin React bileşenleri renderToStaticMarkup ile statik SVG'ye çevrildi,
         `id` -> `data-district` olarak yeniden adlandırıldı, svgo ile sadeleştirildi
         (koordinatlar 1 ondalık). 81 dosya, toplam ~636 KB; sayfa başına yalnızca
         BİR dosya indirilir.

MIT ATIF İSTER: LICENSE-turkey-district-maps.txt bu klasörde kalmalı.

Neden pakete gömülmedi: npm paketi 6.9 MB (81 ilin tamamı). Statik dosya olarak
servis edilince yalnızca açılan operasyonun ili indiriliyor.
