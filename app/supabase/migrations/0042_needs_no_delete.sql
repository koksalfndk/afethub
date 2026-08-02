-- 0042 — İhtiyaç kaydı SİLİNEMEZ (Faz 3-B.1)
--
-- Ölçülen durum (üretim, işlem içinde çalıştırılıp geri alındı):
--   set local role authenticated; -- rolü koordinatör olan bir kullanıcı
--   delete from needs;            -->  IZIN VERILDI (31 satir)
--
-- `needs_coord_write` politikası `for all` yazılmış, dolayısıyla DELETE de kapsamda.
-- Oysa arayüzde ihtiyaç silen HİÇBİR yol yok: `supabaseRepo.ts` yalnızca
-- banner_slides, announcements, locations ve role_invites siliyor. Yani bu,
-- kullanılmayan bir yetki — ve kullanılmayan yetkiler yalnızca kaza ve kötüye
-- kullanım için duruyor.
--
-- Neden bu kayıt özellikle önemli:
--   · İhtiyaç, üründeki en çok miktar taşıyan kayıt (required/verified/pending).
--     Silinmesi `remaining_quantity` geçmişini geri döndürülemez biçimde yok eder
--     (rules/05 §Soft Deletion: "Quantity-affecting records must remain auditable").
--   · `delivery_pledges.need_id` üzerinde ON DELETE CASCADE var. Bir ihtiyacın
--     silinmesi, ona bağlı bütün teslim sözlerini de SESSİZCE götürür ve geriye
--     yalnızca denetim kaydı kalır — tablo ile denetim kaydının birbirinden
--     ayrıldığı tam olarak bu durum.
--
-- Bir ihtiyacı "kapatmanın" doğru yolu zaten var ve hepsi denetim kaydı üretiyor:
-- tamamlandı olarak işaretlemek, duraklatmak, ya da miktarı gerekçeyle güncellemek.
--
-- `locations` ve `announcements` politikaları BİLEREK aynı kalıyor: ikisinde de
-- gerçek bir silme akışı var ve arayüz onay adımıyla soruyor (rules/04
-- §Destructive Actions).

-- `for all` yerine iki ayrı politika: yazma açık, silme kapalı.
drop policy if exists needs_coord_write on needs;

create policy needs_coord_insert on needs for insert
  with check (is_coordinator());

create policy needs_coord_update on needs for update
  using (is_coordinator()) with check (is_coordinator());

-- Politika kalkmış olsa da grant duruyordu; iki katman da kapansın.
revoke delete on needs from anon, authenticated;

notify pgrst, 'reload schema';
