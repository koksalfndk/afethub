-- AfetHUB — migration 0039
-- HERKESE AÇIK AKIŞTAN İÇ GEREKÇEYİ KALDIR.
--
-- Bulunan kusur (02-08-2026, canlı doğrulama): `set_operation_stage()` koordinatörün
-- yazdığı DEĞİŞİKLİK GEREKÇESİNİ `audit_log.detail` alanına yazıyor ve 0036 bu aksiyonu
-- `audit_is_public()` izin listesine eklemişti. `audit_log_public` görünümü `detail`i
-- olduğu gibi döndürdüğü için gerekçe herkese açık API'de göründü — arayüz koordinatöre
-- "yalnızca denetim kaydına yazılır, herkese açık sayfada GÖRÜNMEZ" diyorken.
--
-- Ölçüldü: `/rest/v1/audit_log_public` anon anahtarla üç satırda gerekçeyi döndürüyordu.
--
-- Çözüm görünümde, tabloda DEĞİL: `audit_log` değiştirilemez ve geçmişi düzeltmek
-- kaydı bozmak olurdu. Görünüm bu aksiyonun `detail` alanını boşaltıyor; olayın kendisi
-- (kim, ne zaman, hangi aşamaya) herkese açık kalıyor, gerekçe yalnızca yöneticinin
-- okuyabildiği tabloda duruyor. Geçmiş satırlar da bu andan itibaren kapanıyor.
--
-- Operasyon adı da `detail`den çıkıyor: satır zaten `disaster_id` taşıyor ve arayüz adı
-- oradan yazıyor.
-- =============================================================================

drop view if exists audit_log_public;
create view audit_log_public as
  select
    a.id,
    a.disaster_id,
    mask_actor(a.actor) as actor,
    a.action,
    -- Aşama değişikliğinin gerekçesi İÇ BİLGİDİR. Diğer aksiyonların `detail` alanı
    -- (ihtiyaç adı, teslimat kodu, teslim noktası) zaten herkese açık veridir.
    case when a.action = 'Operasyon aşaması güncellendi' then '' else a.detail end as detail,
    a.old_value,
    a.new_value,
    a.color,
    a.created_at
  from audit_log a
  where audit_is_public(a.action);

comment on view audit_log_public is
  'Public activity feed. Actor is masked to "First S.", only allow-listed actions appear, and the internal reason on a stage change is withheld (0039).';

grant select on audit_log_public to anon, authenticated;

notify pgrst, 'reload schema';
