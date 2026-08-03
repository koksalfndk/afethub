-- 0045 — Takip kodları herkese açık denetim akışından çıkarılıyor (Faz 3-C güvenlik)
--
-- KANIT (üretimde, anon rolüyle ölçüldü):
--
--   set local role anon;
--   select action, detail from audit_log_public ...
--     Teslimat bildirildi          ||  Maske · AFT-4821 · 30 kutu
--     Delivery verified            ||  Maske · AFT-4821 · 30 of 30 kutu
--     Teslimat kısmen doğrulandı   ||  İş Eldiveni · AFT-4818 · 20 çiftin 18'i
--
-- Yani sızıntı istemci biçimlendiricisinde DEĞİL: `audit_log_public` görünümü
-- `detail` sütununu olduğu gibi geçiriyordu ve kod `/rest/v1/audit_log_public`
-- yanıtında dışarı çıkıyordu. Arayüzde metni gizlemek yetmezdi.
--
-- Takip kodu tek başına bir kaydı AÇMIYOR (e-posta eşleşmesi zorunlu, rules/02
-- §Tracking Codes). Ama iki faktörden birini herkese açık bir akışta yayınlamak,
-- o faktörü faktör olmaktan çıkarır.
--
-- ---------------------------------------------------------------------------
-- Yaklaşım
-- ---------------------------------------------------------------------------
-- `detail` alanı ' · ' ile ayrılmış PARÇALARDAN oluşuyor:
--
--   Maske · AFT-4821 · 30 kutu
--   └ihtiyaç  └kod      └miktar
--
-- Bu yüzden metnin içinden belirli bir kalıbı kesip atmak yerine, parçalar
-- ayrıştırılıp KOD OLAN PARÇA DÜŞÜRÜLÜYOR ve kalanlar yeniden birleştiriliyor.
-- Sonuç hem güvenli hem de operasyonel olarak anlamlı kalıyor:
--
--   Maske · 30 kutu
--
-- Kod tanımı tek bir biçime bağlı DEĞİL: "büyük harfli önek + tire + alfanümerik"
-- şeklindeki her parça düşüyor. AFT-, SOZ-, NRQ- ve bugün var olmayan gelecekteki
-- önekler aynı kuralla kapsanıyor (direktif §3: biçimler zamanla değişebilir).
--
-- Bir kayıt SİLİNMİYOR, bir eylem gizlenmiyor: yalnızca herkese açık projeksiyon
-- daraltılıyor. `audit_log` tablosundaki iç kayıt olduğu gibi duruyor ve
-- koordinatör sistem kaydında kod görünmeye devam ediyor.
--
-- Geçmiş kayıtlar da ANINDA güvenli hâle geliyor, çünkü redaksiyon okuma anında
-- hesaplanıyor — geriye dönük bir veri güncellemesi (ve dolayısıyla denetim
-- kaydına dokunmak) gerekmiyor.

-- ---------------------------------------------------------------------------
-- 1) Bir parça takip kodu mu?
-- ---------------------------------------------------------------------------
create or replace function looks_like_tracking_code(p text) returns boolean
language sql immutable set search_path = public as $$
  -- Örnekler: AFT-4821, SOZ-B2JP3G, NRQ-118. Sayı+birim ("30 kutu"), ihtiyaç adı
  -- ("İş Eldiveni") ve il/ilçe ("Rize / Ardeşen") bu kalıba UYMUYOR.
  select btrim(coalesce(p, '')) ~ '^[A-Z]{2,6}-[A-Z0-9]{3,}$';
$$;
revoke all on function looks_like_tracking_code(text) from public;
grant execute on function looks_like_tracking_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Herkese açık metin
-- ---------------------------------------------------------------------------
create or replace function audit_public_text(p_action text, p_text text) returns text
language sql immutable set search_path = public as $$
  select case
    -- Operasyon aşaması gerekçesi iç bilgidir (migration 0039).
    when p_action = 'Operasyon aşaması güncellendi' then ''
    when coalesce(btrim(p_text), '') = '' then coalesce(p_text, '')
    else coalesce(
      nullif(
        (select string_agg(btrim(part), ' · ' order by ord)
           from unnest(string_to_array(p_text, ' · ')) with ordinality as t(part, ord)
          where not looks_like_tracking_code(part)),
        ''),
      '')
  end;
$$;
revoke all on function audit_public_text(text, text) from public;
grant execute on function audit_public_text(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Görünüm
-- ---------------------------------------------------------------------------
-- `old_value` ve `new_value` de aynı süzgeçten geçiyor: bugün kod taşımıyorlar
-- ama gelecekteki bir yazar taşırsa görünüm hazır olmalı. Sütun listesi ve
-- sıralaması AYNEN korunuyor — istemci bu görünümü sütun adıyla okuyor.
create or replace view audit_log_public as
  select id,
         disaster_id,
         mask_actor(actor)                    as actor,
         action,
         audit_public_text(action, detail)    as detail,
         audit_public_text(action, old_value) as old_value,
         audit_public_text(action, new_value) as new_value,
         color,
         created_at
    from audit_log a
   where audit_is_public(action);

-- Görünüm yeniden oluşturulduğunda izinler sıfırlanır; eski hâline getiriliyor.
-- security_invoker BİLEREK kapalı: maskeleme görünüm sahibinin yetkisiyle
-- çalıştığı için anon'un ham `audit_log` tablosuna SELECT izni gerekmiyor
-- (0041 o izni geri aldı ve geri verilmemeli).
revoke all on audit_log_public from public, anon, authenticated;
grant select on audit_log_public to anon, authenticated;

notify pgrst, 'reload schema';
