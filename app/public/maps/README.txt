turkey-provinces.svg
--------------------
81 il sınırı, tek path/il, `data-plate` = plaka kodu.

Kaynak veri : alpers/Turkey-Maps-GeoJSON  (Apache License 2.0)
              https://github.com/alpers/Turkey-Maps-GeoJSON
Dönüşüm     : Web Mercator projeksiyonu + Douglas-Peucker sadeleştirme (eps 0.35),
              koordinatlar 1 ondalığa yuvarlandı. viewBox "0 0 1000 422.5".

Apache-2.0 ATIF İSTER: LICENSE-turkey-geojson.txt bu klasörde tutulmalı ve
kaldırılmamalı. Haritayı değiştirirseniz bu notu da güncelleyin.

Neden pakete gömülmedi: dosya yalnızca koordinasyon panelinde gerekiyor; JS
paketine girseydi her ziyaretçinin ana sayfa indirmesine eklenirdi.
