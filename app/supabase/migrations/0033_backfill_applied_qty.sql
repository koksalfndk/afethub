-- AfetHUB — migration 0033
-- `applied_qty` geriye doldurma — yalnızca GERÇEKTEN karara bağlanmış kayıtlar için.
--
-- 0031'den önce verilmiş kararlarda alan boş. `revise_submission` eski kararın
-- etkisini bu alandan geri alıyor; boş kalırsa "eski etki 0" varsayılır ve düzeltme
-- eskisini düşmeden yenisini ekler — ihtiyacın doğrulanmış miktarı şişerdi.
--
-- Doldurma tahmin DEĞİL, türetme: onaylanmış/kısmen onaylanmış bir kayıtta
-- `needs.verified_qty` değerine eklenen miktar `verified_qty`'nin kendisiydi.
-- Reddedilen ve bilgi istenen kayıtlarda hiçbir şey eklenmemişti → 0.
--
-- `decided_at IS NULL` olan satırlara DOKUNULMUYOR. Bunlar başlangıç verisi:
-- durumları "Verified" görünse de kararları uygulamadan geçmedi ve `needs` sayıları
-- onlardan bağımsız kuruldu (Battaniye 70 doğrulanmış, arkasında 0 teslimat). Onlara
-- bir "uygulanan miktar" atamak, migration 0025'in bilinçli olarak yapmadığı şeyi —
-- olmayan bir karar anını uydurmayı — yapmak olurdu. O satırlar bu yüzden
-- düzeltilemez; `revise_submission` onları zaten reddediyor.
--
-- Idempotent: yalnızca `applied_qty IS NULL` satırlara yazar.
-- =============================================================================

update submissions
   set applied_qty = case
         when status in ('Verified','Partially verified') then coalesce(verified_qty, 0)
         else 0
       end
 where applied_qty is null
   and decided_at is not null;
