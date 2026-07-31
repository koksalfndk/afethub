-- AfetHUB — migration 0027
-- Aciliyet skoruna operasyonun BÜYÜKLÜĞÜ eklendi.
--
-- Gerçek veriyle bakınca formülün iki zayıf yeri çıktı:
--   1. Miktar skora hiç girmiyordu. Kastamonu 13.890 birim, Ayvacık 980 birim
--      hedefliyor; ikisi de "%31 karşılandı" olduğu için skorları 48 ve 45 idi.
--      Aynı yüzde, on beş katı iş demek.
--   2. İkinci küme (49/48/48/45) neredeyse ayrışmıyordu; panoda dört operasyon
--      pratikte aynı görünüyordu.
--
-- Eklenen terim KALAN miktara bakar (hedef değil): aciliyet, yapılacak işin
-- büyüklüğüdür, tanımlanmış hedefin değil.
--
-- Ölçek logaritmik. Doğrusal olsaydı tek bir büyük operasyon diğer bütün
-- bileşenleri ezerdi; log ile 100 kalem 6, 1.000 kalem 12, 10.000 kalem 18 puan
-- alır — büyük olan öne geçer ama kritik ihtiyacı ve tıkanmış kuyruğu bastırmaz.
--
-- Diğer ağırlıklar biraz düşürüldü. Yeni terim eklenince üst sınıra (100) yapışan
-- operasyon sayısı artıyordu; tavana dayanan bir skor sıralama yapamaz.
--
--   kritik ihtiyaç      ×12 → ×10
--   acil ihtiyaç        × 4 → × 3
--   bekleyen doğrulama  × 2 → × 2   (değişmedi)
--   SLA aşan bekleme    × 6 → × 5
--   kurulum eksik       +15 → +15   (değişmedi)
--   düşük karşılama     ×25 → ×18
--   YENİ: kalan miktar  0..24
--
-- İmza değişmiyor, `coordinator_overview()` aynı çağrıyı yapmaya devam eder.
-- İstemcideki kopya (`urgencyScore()` — app/src/data/repo.ts) BUNUNLA BİRLİKTE
-- güncellendi; iki formül ayrışırsa yerel mod ile canlı farklı sıralar.
--
-- Uygulandıktan sonra gerçek veriyle ölçülen sıralama:
--   Seydikemer 97→90, Kastamonu 48→56 (4.→2.), Tavşanlı 49→55,
--   Kaş 48→53, Ayvacık 45→46, Karaburun 15 (değişmedi), Balıkesir 0.
-- =============================================================================

create or replace function afethub_urgency_score(
  p_status         text,
  p_critical       integer,
  p_urgent         integer,
  p_pending        integer,
  p_sla_breached   integer,
  p_delivery_points integer,
  p_required       numeric,
  p_verified       numeric
) returns integer language sql immutable set search_path to 'public' as $$
  select least(100, greatest(0, case when p_status = 'Active' then s else least(s, 20) end))
  from (
    select (
      coalesce(p_critical, 0) * 10
      + coalesce(p_urgent, 0) * 3
      + coalesce(p_pending, 0) * 2
      + coalesce(p_sla_breached, 0) * 5
      + case when p_status = 'Active' and coalesce(p_delivery_points, 0) = 0 then 15 else 0 end
      + case
          when coalesce(p_required, 0) > 0
            then round((1 - least(1, coalesce(p_verified, 0) / p_required)) * 18)
          else 0
        end
      -- Kalan iş hacmi. 10 kalemin altı 0 puan; oradan sonra her on katına 6 puan.
      + greatest(0, least(24, round(
          (log(10, greatest(1, coalesce(p_required, 0) - coalesce(p_verified, 0))) - 1) * 6
        )))
    )::integer as s
  ) q;
$$;
