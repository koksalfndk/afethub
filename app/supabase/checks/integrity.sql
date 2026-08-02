-- AfetHUB — veri bütünlüğü kontrolleri (Faz 3-B.1)
--
-- YALNIZCA OKUR. Tek bir INSERT, UPDATE, DELETE, TRUNCATE veya DDL içermez;
-- üretimde güvenle çalıştırılabilir. Çıktı tek bir tablodur:
--
--   kontrol      : neyin sınandığı
--   agirlik      : KRITIK | UYARI | BILGI
--   bulgu        : kaç kayıt (0 = temiz)
--   ornek        : ilk birkaç örnek, teşhis için
--
-- Çalıştırma (Supabase SQL editöründe ya da psql ile):
--   \i supabase/checks/integrity.sql
--
-- Neden var: 2 Ağustos 2026'da `audit_log` içinde oluşturulup iptal edildiği yazan
-- bir teslim sözü (SOZ-YWVXSJ) `delivery_pledges` tablosunda bulunamadı. Sebep bir
-- doğrulama koşusunun temizlik adımında satırı SİLMESİYDİ — denetim kaydı kaldı,
-- tablo kaydı gitti. Böyle bir ayrışma bir daha olursa elle fark edilmesini
-- beklemek yerine bu script söylesin.

with

-- ---------------------------------------------------------------------------
-- 1) Denetim kaydı var, teslim sözü yok
-- ---------------------------------------------------------------------------
-- "Teslim sözü verildi" satırının `detail` alanı `<ihtiyaç> · <kod>` biçiminde.
-- Koddan geriye tabloya bakıyoruz.
audit_codes as (
  select distinct
         (regexp_match(a.detail, '(SOZ-[A-Z0-9]+)'))[1] as code,
         min(a.created_at) over (partition by (regexp_match(a.detail, '(SOZ-[A-Z0-9]+)'))[1]) as first_seen
  from audit_log a
  where a.action like 'Teslim sözü%'
    and a.detail ~ 'SOZ-[A-Z0-9]+'
),
orphan_audit as (
  select ac.code, ac.first_seen
  from audit_codes ac
  left join delivery_pledges p on p.public_tracking_code = ac.code
  where p.id is null
),

-- ---------------------------------------------------------------------------
-- 2) Teslim sözü var, oluşturma kaydı yok
-- ---------------------------------------------------------------------------
-- Ters yön: RPC dışından (elle INSERT ile) eklenmiş bir satır böyle görünür.
orphan_pledge as (
  select p.public_tracking_code as code, p.created_at
  from delivery_pledges p
  where not exists (
    select 1 from audit_log a
     where a.action = 'Teslim sözü verildi'
       and a.detail like '%' || p.public_tracking_code || '%'
  )
),

-- ---------------------------------------------------------------------------
-- 3) Takip kodu tekrarı
-- ---------------------------------------------------------------------------
-- Benzersizlik kısıtı var; bu kontrol kısıtın YERİNDE OLDUĞUNU da sınıyor.
dup_pledge_code as (
  select public_tracking_code as code, count(*) as n
  from delivery_pledges group by 1 having count(*) > 1
),
-- Bildirim tablosunda kod sütununun adı `code` (teslim sözünde
-- `public_tracking_code`); iki tablo farklı migration'larda doğdu.
dup_sub_code as (
  select code, count(*) as n
  from submissions group by 1 having count(*) > 1
),

-- ---------------------------------------------------------------------------
-- 4) Tutarsız durum / zaman damgası
-- ---------------------------------------------------------------------------
-- `cancelled` ama iptal zamanı yok, ya da iptal zamanı var ama durum başka:
-- ikisi de bir durumun kod dışından değiştirildiğine işaret eder.
bad_cancel as (
  select public_tracking_code as code,
         status::text || ' / cancelled_at=' || coalesce(cancelled_at::text,'NULL') as detail
  from delivery_pledges
  where (status = 'cancelled' and cancelled_at is null)
     or (status <> 'cancelled' and cancelled_at is not null)
),
-- `fulfilled` yalnızca bağlı bir teslimat bildirimi doğrulandığında yazılır
-- (migration 0037 §9). Bağı olmayan bir `fulfilled` kayıt olmamalı.
fulfilled_without_link as (
  select public_tracking_code as code, status::text as detail
  from delivery_pledges
  where status = 'fulfilled' and submission_id is null
),
-- İptal edilmiş ya da süresi dolmuş bir söz bir teslimata bağlanmış olamaz.
closed_with_link as (
  select public_tracking_code as code, status::text as detail
  from delivery_pledges
  where status in ('cancelled','expired') and submission_id is not null
),

-- ---------------------------------------------------------------------------
-- 5) Çapraz operasyon bağı
-- ---------------------------------------------------------------------------
-- Sözün `disaster_id` alanı, bağlı olduğu ihtiyacın operasyonuyla aynı olmalı.
-- Farklıysa bir kalem başka bir afetin sayfasında görünüyor demektir.
cross_op_pledge as (
  select p.public_tracking_code as code,
         'soz=' || p.disaster_id::text || ' ihtiyac=' || n.disaster_id::text as detail
  from delivery_pledges p join needs n on n.id = p.need_id
  where p.disaster_id <> n.disaster_id
),
-- Teslim noktası da aynı operasyona ait olmalı.
cross_op_location as (
  select p.public_tracking_code as code,
         'soz=' || p.disaster_id::text || ' nokta=' || l.disaster_id::text as detail
  from delivery_pledges p join locations l on l.id = p.delivery_location_id
  where p.disaster_id <> l.disaster_id
),
-- Bildirimde teslim noktası bir kimlik değil, serbest metin (`location_name`);
-- bu yüzden karşılaştırma bildirimin kendi operasyonu ile ihtiyacınki arasında.
cross_op_submission as (
  select s.code,
         'bildirim=' || s.disaster_id::text || ' ihtiyac=' || n.disaster_id::text as detail
  from submissions s
  join needs n on n.id = s.need_id
  where s.disaster_id <> n.disaster_id
),

-- ---------------------------------------------------------------------------
-- 6) Miktar bütünlüğü
-- ---------------------------------------------------------------------------
-- Kanonik formül: remaining = max(required - verified, 0).
bad_remaining as (
  select name as code,
         'kalan=' || remaining_qty || ' beklenen=' || greatest(required_qty - verified_qty, 0) as detail
  from needs
  where remaining_qty <> greatest(required_qty - verified_qty, 0)
),
-- Doğrulanan miktar talep edileni AŞAMAZ (rules/02 §Over-Approval).
over_verified as (
  select name as code, 'dogrulanan=' || verified_qty || ' talep=' || required_qty as detail
  from needs where verified_qty > required_qty
),
negative_qty as (
  select name as code,
         'talep=' || required_qty || ' dogrulanan=' || verified_qty || ' bekleyen=' || pending_qty as detail
  from needs where required_qty < 0 or verified_qty < 0 or pending_qty < 0
),
-- Teslim sözü miktarı pozitif olmalı.
bad_pledge_qty as (
  select public_tracking_code as code, 'miktar=' || qty as detail
  from delivery_pledges where qty <= 0
),

-- ---------------------------------------------------------------------------
-- Toplama
-- ---------------------------------------------------------------------------
findings as (
  select 'denetim kaydi var, teslim sozu YOK'      as kontrol, 'KRITIK' as agirlik, code, first_seen::text as detail from orphan_audit
  union all
  select 'teslim sozu var, olusturma kaydi YOK',        'KRITIK', code, created_at::text from orphan_pledge
  union all
  select 'takip kodu tekrari (teslim sozu)',            'KRITIK', code, n::text          from dup_pledge_code
  union all
  select 'takip kodu tekrari (bildirim)',               'KRITIK', code, n::text          from dup_sub_code
  union all
  select 'kalan miktar formule uymuyor',                'KRITIK', code, detail           from bad_remaining
  union all
  select 'dogrulanan miktar talebi asiyor',             'KRITIK', code, detail           from over_verified
  union all
  select 'negatif miktar',                              'KRITIK', code, detail           from negative_qty
  union all
  select 'capraz operasyon: soz / ihtiyac',             'KRITIK', code, detail           from cross_op_pledge
  union all
  select 'capraz operasyon: soz / teslim noktasi',      'UYARI',  code, detail           from cross_op_location
  union all
  select 'capraz operasyon: bildirim / ihtiyac',        'KRITIK', code, detail           from cross_op_submission
  union all
  select 'iptal durumu ve zaman damgasi uyusmuyor',     'UYARI',  code, detail           from bad_cancel
  union all
  select 'fulfilled ama bagli bildirim yok',            'UYARI',  code, detail           from fulfilled_without_link
  union all
  select 'kapali soz bir bildirime bagli',              'UYARI',  code, detail           from closed_with_link
  union all
  select 'teslim sozu miktari pozitif degil',           'UYARI',  code, detail           from bad_pledge_qty
)

select kontrol,
       agirlik,
       count(*)                                                   as bulgu,
       string_agg(code || ' (' || detail || ')', ' | ' order by code)
         filter (where code is not null)                          as ornek
from findings
group by kontrol, agirlik
order by case agirlik when 'KRITIK' then 1 when 'UYARI' then 2 else 3 end, kontrol;
