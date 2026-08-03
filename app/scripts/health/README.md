# Üretim sağlık kontrolleri

Hepsi **salt okunur**. Hiçbiri INSERT, UPDATE, DELETE, TRUNCATE veya DDL içermez;
canlı veritabanında güvenle çalıştırılabilir.

| Dosya | Ne sorar |
|---|---|
| `permissions.sql` | anon ve authenticated rollerinde gereksiz tablo izni kaldı mı |
| `rls.sql` | RLS her tabloda açık mı, politikası olmayan komut izni var mı |
| `public-surface.sql` | herkese açık yüzeyden kişisel veri veya takip kodu sızıyor mu |
| `audit.sql` | hangi eylem herkese açık, hangisi özel |
| `integrity.sql` | miktar formülü, kod tekrarı, durum/zaman tutarlılığı |
| `orphan.sql` | denetim kaydı ile tablo arasındaki ayrışma |
| `pledge-operations.sql` | teslim sözü durum makinesi ve bağlama kısıtları |

## Çalıştırma

```
npm run production-check          # bağlantı dizesini ister
DATABASE_URL=... npm run production-check
```

Betik her dosyayı sırayla çalıştırır, bulgu üretenleri yazar ve **bulgu varsa
sıfırdan farklı bir kodla çıkar**. Bilinen istisnalar ayrı bölümde listelenir;
sessizce geçilmez.
