-- 0046 — Teslim sözü süre dolumu için zamanlayıcı (Faz 3-D)
--
-- SORUN
-- -----
-- `expire_stale_pledges()` 0037'den beri var ve çalışıyor, ama hiçbir şey onu
-- ÇAĞIRMIYOR. Sonuç: "Süresi Dolan" görünümü yalnızca elle işaretlenmiş kayıtları
-- gösteriyor; teslim tarihi iki gün geçmiş bir söz koordinatör ekranında hâlâ
-- "bekleniyor" gibi duruyor. Faz 3-C kapanış raporu bunu bilinen sınırlama olarak
-- yazdı ve buraya bıraktı.
--
-- Fonksiyonun gövdesindeki ilk satır `if not is_coordinator() then raise` — yani
-- bir zamanlayıcı onu ÇAĞIRAMAZ: pg_cron işleri `postgres` rolüyle çalışır,
-- `auth.uid()` null döner, `is_coordinator()` false olur ve iş her seferinde
-- hata ile düşer. Yetki kontrolünü gevşetmek bu sorunu çözerdi ama bir
-- fonksiyonun yetki mantığını iki farklı çağırana birden hizmet ettirirdi; o
-- mantık zamanla en gevşek çağırana göre şekillenir.
--
-- YAKLAŞIM
-- --------
-- Üç fonksiyon, tek gövde:
--
--   expire_stale_pledges_core()    ortak iş — yetki kontrolü YOK, kimseye açık DEĞİL
--   expire_stale_pledges()         koordinatör girişi (imza aynı kaldı)
--   expire_stale_pledges_system()  zamanlayıcı girişi — yalnızca postgres
--
-- Yetki kararı çağrı noktasında veriliyor, ortak gövdede değil. `_core` hiçbir
-- role verilmiyor (`revoke ... from public` + hiç `grant` yok), dolayısıyla
-- PostgREST yüzeyinde de yok: anon ya da authenticated bir istemci onu
-- doğrudan çağıramaz.
--
-- İKİNCİ KUSUR: DENETİM KAYDI YOKTU
-- ---------------------------------
-- 0037'deki sürüm durumu `expired` yapıyor ama `audit_log`a HİÇBİR ŞEY yazmıyordu.
-- `set_pledge_status()` her geçiş için bir satır yazarken, süre dolumu sessizce
-- oluyordu — rules/03 §Audit Log "durum değiştiren her işlem denetim olayı
-- üretir" diyor. Artık kayıt BAŞINA bir satır yazılıyor, eylem adı
-- `set_pledge_status`in zaten kullandığı adla aynı: `Teslim sözünün süresi doldu`.
-- Bu eylem `audit_is_public()` listesinde DEĞİL, yani herkese açık akışa düşmüyor.
--
-- DEĞİŞMEZLER
-- -----------
-- - Süre dolumu HİÇBİR miktarı değiştirmez (talep, doğrulanan, bekleyen, kalan).
-- - Yalnızca `pledged` ve `confirmed` kayıtlar etkilenir. `in_transit` bilerek
--   DIŞARIDA: yola çıkmış birine "süren doldu" demek, doğru olmayan bir şey
--   söylemektir; onu koordinatör kapatır.
-- - `estimated_delivery_at is null` olan kayıt hiç süresi dolmuş sayılmaz —
--   tarih vermeyen kişiye geçmediği bir tarih atfedilmiyor.
-- - Pay süresi en az 1 saat (`greatest(1, ...)`): 0 ya da negatif bir değer
--   henüz teslim saati gelmemiş sözleri toplardı.

-- ---------------------------------------------------------------------------
-- 1) Ortak gövde
-- ---------------------------------------------------------------------------
create or replace function expire_stale_pledges_core(
  p_grace_hours integer,
  p_actor       text
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  r       record;
begin
  -- Satır satır ilerliyor çünkü her kayıt için AYRI bir denetim satırı gerekiyor
  -- ve o satır kaydın kendi takip kodunu ve eski durumunu taşımalı. Toplu bir
  -- update + tek özet satır, "hangi söz kapandı" sorusunu cevaplayamazdı.
  --
  -- `for update skip locked`: aynı anda bir koordinatör o kaydı elle
  -- güncelliyorsa zamanlayıcı onu atlar, beklemez. Zamanlanmış bir iş, insan
  -- işlemini kilitte bekletmemeli.
  for r in
    select id, disaster_id, status, public_tracking_code
      from delivery_pledges
     where status in ('pledged', 'confirmed')
       and estimated_delivery_at is not null
       and estimated_delivery_at < now() - make_interval(hours => greatest(1, p_grace_hours))
     order by estimated_delivery_at
       for update skip locked
  loop
    -- Durum makinesi tek doğruluk kaynağı: burada ayrı bir geçiş listesi
    -- tutulmuyor. Bir gün `confirmed -> expired` yasaklanırsa bu döngü de
    -- kendiliğinden ona uyar.
    if not pledge_transition_allowed(r.status, 'expired') then
      continue;
    end if;

    update delivery_pledges
       set status = 'expired', updated_at = now()
     where id = r.id;

    insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
    values (r.disaster_id, p_actor, 'Teslim sözünün süresi doldu',
            r.public_tracking_code, r.status::text, 'expired', '#8A94A6');

    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;
-- Hiçbir role açılmıyor. PostgreSQL fonksiyonları varsayılan olarak PUBLIC'e
-- açıktır (0043'te bu tuzağa düşülmüştü) — bu yüzden revoke AÇIKÇA yazılıyor.
revoke all on function expire_stale_pledges_core(integer, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Koordinatör girişi — imza ve dönüş tipi 0037'deki gibi
-- ---------------------------------------------------------------------------
create or replace function expire_stale_pledges(p_grace_hours integer default 48)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can expire pledges';
  end if;
  select coalesce(full_name, 'Koordinatör') into actor_name from profiles where id = auth.uid();
  return expire_stale_pledges_core(p_grace_hours, coalesce(actor_name, 'Koordinatör'));
end $$;
revoke all on function expire_stale_pledges(integer) from public, anon;
grant execute on function expire_stale_pledges(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Zamanlayıcı girişi
-- ---------------------------------------------------------------------------
-- Aktör adı `Sistem`: denetim kaydını okuyan kişi bunun bir insan kararı
-- OLMADIĞINI görmeli. Maskeleme uygulanmıyor çünkü maskelenecek bir kişi yok.
create or replace function expire_stale_pledges_system(p_grace_hours integer default 48)
returns integer
language plpgsql security definer set search_path = public as $$
begin
  return expire_stale_pledges_core(p_grace_hours, 'Sistem');
end $$;
revoke all on function expire_stale_pledges_system(integer) from public, anon, authenticated;
-- `postgres` zaten sahibi; grant eklenmiyor. Yüzey: yalnızca pg_cron işi.

-- ---------------------------------------------------------------------------
-- 4) Zamanlayıcı
-- ---------------------------------------------------------------------------
-- `with schema pg_catalog` Supabase'in belgelediği kurulum biçimi. Eklenti
-- relocatable değil (kontrol dosyasında `schema = pg_catalog`) ve kendi `cron`
-- şemasını kendisi açar; bu yüzden ifade yalnızca belgeye uymak için açık yazıldı.
create extension if not exists pg_cron with schema pg_catalog;

-- Supabase'de `postgres` superuser DEĞİL: eklenti kurulduktan sonra bu iki grant
-- olmadan `cron.job` okunamıyor ve `cron.schedule` çağrılamıyor.
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Tekrar çalıştırılabilir olmalı: aynı adlı iş varsa önce kaldırılıyor.
-- `cron.unschedule` iş yoksa hata veriyor, o yüzden varlığı önce sorgulanıyor.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'expire-stale-pledges') then
    perform cron.unschedule('expire-stale-pledges');
  end if;
end $$;

-- Saat başında değil 17. dakikada: Supabase'de saat başı zaten yoğun ve bu işin
-- dakikası önemli değil. Saatlik sıklık 48 saatlik payın yanında fazlasıyla
-- yeterli — daha sık çalışmak aynı sonucu üretip boşuna kilit alırdı.
select cron.schedule('expire-stale-pledges', '17 * * * *',
                     $job$select public.expire_stale_pledges_system(48)$job$);

notify pgrst, 'reload schema';
