-- 0043 — Fonksiyon yüzeyinin daraltılması (Faz 3-B.1)
--
-- Supabase güvenlik denetçisinin (`get_advisors`) üretimde bulduğu iki maddeyi
-- kapatıyor. İkisi de "gereksiz yüzey" sınıfında; davranış değiştirmiyor.
--
-- ---------------------------------------------------------------------------
-- 1) TETİKLEYİCİ fonksiyonları REST yüzeyinden çıkar
-- ---------------------------------------------------------------------------
-- `public` şemasındaki her fonksiyon PostgREST tarafından `/rest/v1/rpc/<ad>`
-- olarak yayınlanıyor. Tetikleyici fonksiyonları da bu listede: anon rolü
-- `audit_log_immutable` veya `disasters_audit` çağırabiliyordu.
--
-- Çağrı pratikte işe yaramaz (tetikleyici bağlamı olmadan hata verir) ama
-- yayınlanmış olmaları başlı başına yanlış: bunlar API değil, tablo iç işleyişi.
-- Tetikleyiciler tablo sahibinin yetkisiyle çalışır; EXECUTE iznini geri almak
-- tetikleme davranışını ETKİLEMEZ.
--
-- DİKKAT — burada bir tuzak var ve ilk denemede tam da ona düştüm: PostgreSQL yeni
-- bir fonksiyonu varsayılan olarak `PUBLIC` rolüne EXECUTE ile açar. Yalnızca
-- `anon, authenticated` üzerinden geri almak HİÇBİR ŞEY değiştirmez; izin PUBLIC
-- üzerinden gelmeye devam eder. Ölçüm bunu gösterdi (revoke sonrası hâlâ 8
-- fonksiyon anon'a açıktı). Doğrusu PUBLIC'ten geri almak.
revoke execute on function audit_announcement_change()       from public, anon, authenticated;
revoke execute on function audit_location_change()           from public, anon, authenticated;
revoke execute on function audit_log_immutable()             from public, anon, authenticated;
revoke execute on function disasters_audit()                 from public, anon, authenticated;
revoke execute on function organizations_audit_insert()      from public, anon, authenticated;
revoke execute on function profiles_reset_org_verification() from public, anon, authenticated;
revoke execute on function volunteer_code_default()          from public, anon, authenticated;
revoke execute on function volunteer_inherit_consent()       from public, anon, authenticated;

-- İç yardımcılar: dışarıdan çağrılmaları için bir sebep yok.
revoke execute on function gen_volunteer_code()              from public, anon, authenticated;
revoke execute on function org_edit_field_column(text)       from public, anon, authenticated;

-- `disaster_by_slug` BİLEREK açık kalıyor: herkese açık afet sayfası onu çağırıyor.

-- ---------------------------------------------------------------------------
-- 2) Değişken search_path
-- ---------------------------------------------------------------------------
-- search_path'i sabitlenmemiş bir fonksiyon, çağıranın search_path'ini kullanır.
-- Saldırgan kendi şemasına aynı adla bir tablo/fonksiyon koyup fonksiyonun onu
-- çağırmasını sağlayabilir — SECURITY DEFINER fonksiyonlarda klasik yetki
-- yükseltme yolu. Beş fonksiyonda eksikti; hepsi `public`e sabitleniyor.
--
-- `alter function ... set search_path` gövdeyi yeniden yazmaz, yalnızca çalışma
-- ortamını sabitler; davranış aynı kalır.
alter function profiles_reset_org_verification() set search_path = public;
alter function volunteer_code_default()          set search_path = public;
alter function gen_volunteer_code()              set search_path = public;
alter function org_edit_field_column(text)       set search_path = public;
alter function disaster_by_slug(text)            set search_path = public;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- İNCELENDİ, DEĞİŞTİRİLMEDİ (gerekçesiyle)
-- ---------------------------------------------------------------------------
-- · `security_definer_view` (denetçide ERROR, 8 görünüm): audit_log_public,
--   organizations_public, disaster_reports_public ve diğerleri BİLEREK
--   security_invoker=false. Maskeleme tam olarak bu sayede çalışıyor — görünüm
--   sahibinin yetkisiyle okuyup dışarıya yalnızca izin verilen sütunları veriyor.
--   security_invoker'a çevirmek, anon'a ham tablolarda SELECT vermeyi gerektirirdi;
--   yani denetçiyi memnun etmek için gerçek yüzeyi büyütmek olurdu.
--
-- · `anon_security_definer_function_executable` (20 fonksiyon): misafir akışının
--   kendisi. Hesapsız katkı ürünün birinci kuralı (CLAUDE.md §Primary Product Rule);
--   bu fonksiyonların anon'a açık olması tasarımın gereği.
--
-- · `contact_message_context` / `volunteer_receipt_context`: yalnızca UUID alıyorlar
--   ama TEK KULLANIMLIK ve süreli — ilgili satırı ancak `*_sent_at is null` ve
--   `created_at > now() - 15 dakika` iken döndürüyor, döndürürken de damgalıyor.
--   Tahmin edilemez bir UUID + 15 dakika + tek kullanım yeterli bir eşik.
--
-- · `rls_policy_always_true` (need_requests_insert, submissions_insert): misafirin
--   kayıt oluşturabilmesi için gerekli. Kötüye kullanım koruması bu katmanda değil,
--   doğrulama ve moderasyon katmanında (rules/03 §Abuse Prevention).
