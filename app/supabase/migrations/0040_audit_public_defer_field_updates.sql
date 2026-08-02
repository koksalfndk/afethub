-- AfetHUB — migration 0040
-- Saha güncellemesi aksiyonlarını herkese açık akıştan Faz 4'e kadar geri çek.
--
-- 0038 bu üç aksiyonu izin listesine eklemişti, ama modülün ARAYÜZÜ henüz yayında
-- değil (Faz 4). Sonuç: ziyaretçinin gördüğü "Hareketler" akışında, kaynağı hiçbir
-- sayfada bulunmayan satırlar belirdi — canlı doğrulama sırasında yazılan test
-- metinleri dahil. Kaynağı olmayan bir satır, akışın tek işini (olanı doğrulanabilir
-- kılmak) bozar.
--
-- `audit_log` DEĞİŞTİRİLMİYOR: satırlar yerinde duruyor ve yönetici okuyabiliyor.
-- Değişen tek şey görünürlük. Faz 4'te modül yayına girdiğinde bu üç aksiyon listeye
-- geri eklenecek.
-- =============================================================================

create or replace function audit_is_public(p_action text)
returns boolean language sql immutable set search_path = public as $$
  select p_action = any (array[
    'İhtiyaç oluşturuldu', 'Miktar güncellendi', 'İhtiyaç tamamlandı', 'Need completed',
    'Teslimat bildirildi', 'Teslimat doğrulandı', 'Teslimat kısmen doğrulandı', 'Teslimat reddedildi',
    'Delivery verified', 'Delivery partially verified', 'Delivery rejected',
    'Duyuru yayınlandı', 'Duyuru güncellendi', 'Duyuru kaldırıldı',
    'Teslim noktası eklendi', 'Teslim noktası güncellendi', 'Teslim noktası kaldırıldı',
    'Afet oluşturuldu', 'Afet durumu güncellendi', 'Operasyon açıldı', 'Afet kaydı güncellendi',
    'Topluluk afeti oluşturuldu', 'Topluluk afeti doğrulandı',
    'Kurum eklendi', 'Kurum doğrulandı',
    'Afet bildirimi gönderildi', 'Afet bildirimi birleştirildi', 'Afet bildirimi doğrulandı',
    'Operasyon aşaması güncellendi'
    -- Faz 4'te geri eklenecek: 'Saha güncellemesi yayınlandı',
    -- 'Saha güncellemesi düzeltildi', 'Saha güncellemesi sabitlendi'
  ]);
$$;

notify pgrst, 'reload schema';
