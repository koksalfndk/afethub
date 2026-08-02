-- 0041 — Gereksiz tablo izinlerinin geri alınması (Faz 3-B.1)
--
-- Neden: Supabase yeni bir şemayı `grant all on all tables to anon, authenticated`
-- ile kuruyor. Bugüne kadar bunu RLS taşıdı ve taşımaya da devam ediyor — ama tek
-- bir istisna var ve tam da en kritik tabloyu ilgilendiriyor:
--
--   TRUNCATE, RLS'e TABİ DEĞİLDİR.
--
-- Üretimde ölçüldü (işlem içinde çalıştırılıp geri alındı):
--   set local role anon; truncate table audit_log cascade;  -->  BAŞARILI, 0 satır
--
-- Yani "değişmez" dediğimiz denetim kaydının tek koruması, PostgREST'in TRUNCATE
-- komutunu dışarı vermemesiydi. Bu bir yetkilendirme değil, bir tesadüf. Aradaki
-- katmanın bir gün ham SQL çalıştırmasına izin veren bir yol açması (SECURITY
-- INVOKER bir fonksiyonda enjeksiyon, anon anahtarıyla yazılmış bir edge
-- fonksiyonu) yeterli olurdu.
--
-- Bu migration İKİ kural uyguluyor:
--
--   1. TRUNCATE / REFERENCES / TRIGGER hiçbir istemci yolunda kullanılmıyor.
--      Tamamen geri alınıyor ve gelecekteki tablolar için varsayılan da değişiyor.
--
--   2. Bir komutun RLS politikası YOKSA, o komut zaten reddediliyor demektir;
--      izni bırakmak yalnızca yüzey büyütür. Aşağıdaki liste el yordamıyla değil,
--      `pg_policies` taranarak çıkarıldı: her satır "politikası olmayan komut"
--      olduğu için davranış AYNEN korunuyor.
--
-- Davranış değişikliği hedeflenmiyor. Anon'un okuduğu hiçbir görünüm, koordinatörün
-- kullandığı hiçbir ekran ve hiçbir RPC etkilenmiyor. RPC'ler SECURITY DEFINER
-- olduğu için tablo izinlerinden bağımsız çalışmaya devam eder; EXECUTE izinlerine
-- BU MIGRATION DOKUNMUYOR.

-- ---------------------------------------------------------------------------
-- 1) RLS'in koruyamadığı komutlar
-- ---------------------------------------------------------------------------
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Bundan sonra yaratılacak tablolar da aynı şekilde açılmasın. (Supabase'in
-- varsayılanı postgres rolü üzerinden tanımlı; burada onu daraltıyoruz.)
alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) delivery_pledges — istemci bu tabloya HİÇ dokunmuyor
-- ---------------------------------------------------------------------------
-- Bütün yollar SECURITY DEFINER RPC'lerinden geçiyor: create_delivery_pledge,
-- track_delivery_pledge, cancel_delivery_pledge, set_pledge_status,
-- link_pledge_to_submission, expire_stale_pledges. `supabaseRepo.ts` içinde bu
-- tabloya tek bir `.from('delivery_pledges')` çağrısı yok.
--
-- SELECT politikaları (kendi kaydını okuma, koordinatör okuma) BIRAKILIYOR: bir
-- gün doğrudan okuma gerekirse yalnızca grant geri verilir, politika yeniden
-- yazılmaz. Koordinatör teslim sözü paneli (Faz 4) geldiğinde ya bir RPC ekler
-- ya da buraya `grant select ... to authenticated` döner.
revoke all on delivery_pledges from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) audit_log — yazma yolları yalnızca SECURITY DEFINER
-- ---------------------------------------------------------------------------
-- Denetim kaydına yazan her şey (approve_submission, set_operation_stage,
-- create_delivery_pledge, …) SECURITY DEFINER. Doğrudan INSERT/UPDATE/DELETE'in
-- hiçbir meşru kullanıcısı yok.
revoke insert, update, delete on audit_log from anon, authenticated;

-- Anon herkese açık akışı `audit_log_public` görünümünden okuyor ve o görünüm
-- security_invoker=false, yani sahibinin yetkisiyle çalışıyor: anon'un ham tabloya
-- SELECT izni GEREKMİYOR. `authenticated` için bırakılıyor — yönetici sistem kaydı
-- ekranı ham tabloyu okuyor ve `audit_read` politikası zaten is_admin() istiyor.
revoke select on audit_log from anon;

-- ---------------------------------------------------------------------------
-- 4) Politikası olmayan diğer komutlar (RLS zaten reddediyor)
-- ---------------------------------------------------------------------------
revoke insert, update, delete on contact_attachments            from anon, authenticated;
revoke insert, update, delete on contact_messages               from anon, authenticated;
revoke insert, update, delete on disaster_report_confirmations  from anon, authenticated;
revoke update, delete        on need_requests                   from anon, authenticated;
revoke update, delete        on submissions                     from anon, authenticated;
revoke delete                on disasters                       from anon, authenticated;
revoke delete                on organization_edit_requests       from anon, authenticated;
revoke delete                on volunteer_applications           from anon, authenticated;
revoke insert, delete        on profiles                         from anon, authenticated;

-- operation_updates ailesi BİLEREK dışarıda: 0038 onlara sütun seviyesinde grant
-- verdi ve tablo seviyesinde `revoke` o ince ayarı da silerdi.

-- ---------------------------------------------------------------------------
-- 5) Görünümler yalnızca okunur
-- ---------------------------------------------------------------------------
revoke insert, update, delete on audit_log_public                  from anon, authenticated;
revoke insert, update, delete on disaster_overview                 from anon, authenticated;
revoke insert, update, delete on disaster_reports_admin            from anon, authenticated;
revoke insert, update, delete on disaster_reports_public           from anon, authenticated;
revoke insert, update, delete on need_pledge_totals                from anon, authenticated;
revoke insert, update, delete on operation_media_public            from anon, authenticated;
revoke insert, update, delete on operation_updates_public          from anon, authenticated;
revoke insert, update, delete on organization_edit_requests_review from anon, authenticated;
revoke insert, update, delete on organizations_public              from anon, authenticated;

notify pgrst, 'reload schema';
