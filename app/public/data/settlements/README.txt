Yerleşim listeleri — <plaka>.json
---------------------------------
İl başına tek dosya. Yapı:

  { "<İlçe adı>": { "m": ["mahalle", ...], "k": ["köy", ...] }, ... }

Yalnızca AD tutulur. Nüfus, posta kodu, koordinat vb. kaynak veri setinde var ama
buraya alınmadı: bu dosyalar bir SEÇİCİYİ beslemek için, hepsini taşımak indirmeyi
birkaç katına çıkarırdı.

Kaynak : TurkiyeAPI — https://github.com/ubeydeozdmr/turkiye-api  (MIT)
         Veri seti sürümü 2025. Kaynak veriler TÜİK MEDAS, PTT ve
         MSB Harita Genel Müdürlüğü'ne dayanıyor (bkz. kaynak deponun dataset-meta).
Üretim : districts.json + neighborhoods.json + villages.json dosyaları ilçe adına
         göre gruplanıp il başına tek dosyaya yazıldı (50.437 kayıt, eşleşmeyen 0).
         Üretim betiği tek seferlik; ham veri depoya alınmadı (_veri/ gitignore'da).

81 dosya, toplam ~620 KB. Sayfa başına yalnızca BİR il dosyası indirilir
(Muğla 7 KB, İstanbul 13 KB, Ankara 18 KB).

MIT ATIF İSTER: LICENSE-turkiye-api.txt bu klasörde kalmalı.

Not: bazı ilçelerde köy listesi boştur (Seydikemer'de 65 mahalle, 0 köy). Bu bir
eksik değil — 6360 sayılı kanunla büyükşehir ilçelerinde köyler mahalleye
dönüştürüldü. Ekranda "köy" başlığı boşsa hiç gösterilmemeli.
