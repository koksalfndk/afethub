-- AfetHUB seed — Seydikemer Wildfire (Turkish content, canonical enum keys).
-- Run AFTER schema.sql, in the AfetHUB project SQL editor. Safe to re-run:
-- it clears the operational tables first. Never run against a PatiBase project.

begin;

delete from audit_log;
delete from submissions;
delete from need_requests;
delete from announcements;
delete from needs;
delete from locations;
delete from disasters;

-- Fixed UUIDs so relationships are stable and re-runnable.
insert into disasters (id, name, region, status, situation, opened_at, updated_at) values
('d0000000-0000-0000-0000-0000000000d1',
 'Seydikemer Orman Yangını', 'Seydikemer, Muğla · Türkiye', 'Active',
 'Kuzey sırtındaki yangın cepheleri kontrol altında; dört mahalle hâlâ tahliye halinde. Sahada 168 gönüllü kayıtlı. Yardım girişi 08:00–22:00 arası kapalı pazar yerinden yapılıyor, bu akşam ikinci bir giriş noktası açılıyor.',
 date '2026-07-21', now() - interval '4 minutes');

insert into locations (id, disaster_id, name, address, hours, accepts, contact_name, contact_phone, status, lat, lng) values
('10c00000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-0000000000d1','Seydikemer Kapalı Pazar Yeri','Atatürk Cd. 14, Seydikemer / Muğla','Her gün 08:00 – 22:00','Tıbbi, hijyen, giyim, enerji','Elif Kaya','+90 555 210 44 18','Teslim alıyor',36.6321,29.3187),
('10c00000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-0000000000d1','Çamlıyayla Okul Spor Salonu','Çamlıyayla Mah. Okul Sk. 3, Seydikemer','Her gün 09:00 – 19:00','Ekipman, giyim, pil','Hakan Öz','+90 555 884 02 31','20:00''de açılıyor',36.6688,29.2740);

insert into needs (id, disaster_id, name, category, priority, required_qty, verified_qty, pending_qty, unit, location_name, updated_at) values
('4eed0000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-0000000000d1','Maske','Sağlık','Critical',100,30,15,'kutu','Seydikemer Kapalı Pazar Yeri', now() - interval '4 minutes'),
('4eed0000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-0000000000d1','Göz Damlası','Sağlık','Critical',100,15,10,'adet','Seydikemer Kapalı Pazar Yeri', now() - interval '11 minutes'),
('4eed0000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-0000000000d1','Powerbank','Enerji','Urgent',50,12,6,'adet','Seydikemer Kapalı Pazar Yeri', now() - interval '18 minutes'),
('4eed0000-0000-0000-0000-000000000004','d0000000-0000-0000-0000-0000000000d1','Pil','Enerji','Urgent',200,65,20,'paket','Çamlıyayla Okul Spor Salonu', now() - interval '24 minutes'),
('4eed0000-0000-0000-0000-000000000005','d0000000-0000-0000-0000-0000000000d1','Kafa Lambası','Ekipman','Urgent',40,8,2,'adet','Seydikemer Kapalı Pazar Yeri', now() - interval '32 minutes'),
('4eed0000-0000-0000-0000-000000000006','d0000000-0000-0000-0000-0000000000d1','İş Eldiveni','Ekipman','Normal',100,40,8,'çift','Çamlıyayla Okul Spor Salonu', now() - interval '1 hour'),
('4eed0000-0000-0000-0000-000000000007','d0000000-0000-0000-0000-0000000000d1','Islak Mendil','Hijyen','Normal',300,120,35,'paket','Seydikemer Kapalı Pazar Yeri', now() - interval '1 hour'),
('4eed0000-0000-0000-0000-000000000008','d0000000-0000-0000-0000-0000000000d1','İş Pantolonu','Giyim','Normal',60,18,5,'adet','Çamlıyayla Okul Spor Salonu', now() - interval '2 hours'),
('4eed0000-0000-0000-0000-000000000009','d0000000-0000-0000-0000-0000000000d1','Tişört ve Gömlek','Giyim','Normal',150,55,12,'adet','Seydikemer Kapalı Pazar Yeri', now() - interval '2 hours');

insert into submissions (code, disaster_id, need_id, contributor_name, contributor_email, contributor_phone, city, qty, unit, location_name, status, verified_qty, note, submitted_at) values
('AFT-4821','d0000000-0000-0000-0000-0000000000d1','4eed0000-0000-0000-0000-000000000001','Ayşe Yılmaz','ayse@example.com','+90 555 111 11 11','Muğla',30,'kutu','Seydikemer Kapalı Pazar Yeri','Pending verification',null,'Pazar yerinde giriş kontrolü bekleniyor.', now() - interval '12 minutes'),
('AFT-4822','d0000000-0000-0000-0000-0000000000d1','4eed0000-0000-0000-0000-000000000004','Mert Demir','mert@example.com','+90 555 222 22 22','Fethiye',25,'paket','Çamlıyayla Okul Spor Salonu','Pending verification',null,'Saat 17:00''de bir minibüsle geliyor.', now() - interval '26 minutes'),
('AFT-4823','d0000000-0000-0000-0000-0000000000d1','4eed0000-0000-0000-0000-000000000007','Zeynep Arslan','zeynep@example.com','+90 555 333 33 33','İzmir',60,'paket','Seydikemer Kapalı Pazar Yeri','Pending verification',null,'İki palet, boşaltma için yardım isteniyor.', now() - interval '41 minutes'),
('AFT-4824','d0000000-0000-0000-0000-0000000000d1','4eed0000-0000-0000-0000-000000000003','Barış Koç','baris@example.com','+90 555 444 44 44','Denizli',6,'adet','Seydikemer Kapalı Pazar Yeri','Pending verification',null,'Şarj kabloları dahil.', now() - interval '1 hour'),
('AFT-4818','d0000000-0000-0000-0000-0000000000d1','4eed0000-0000-0000-0000-000000000006','Selin Aydın','selin@example.com','+90 555 555 55 55','Antalya',20,'çift','Çamlıyayla Okul Spor Salonu','Partially verified',18,'2 çift yanlış bedendi ve sayıma alınamadı.', now() - interval '3 hours'),
('AFT-4812','d0000000-0000-0000-0000-0000000000d1','4eed0000-0000-0000-0000-000000000009','Emre Şahin','emre@example.com','+90 555 666 66 66','Muğla',40,'adet','Seydikemer Kapalı Pazar Yeri','Verified',40,'Sayıldı ve C bölümünde depolandı.', now() - interval '5 hours'),
('AFT-4809','d0000000-0000-0000-0000-0000000000d1','4eed0000-0000-0000-0000-000000000005','Deniz Uysal','deniz@example.com','+90 555 777 77 77','Aydın',12,'adet','Seydikemer Kapalı Pazar Yeri','Rejected',0,'Ürünler teslim noktasına ulaşmadı.', now() - interval '6 hours');

insert into announcements (disaster_id, kind, accent, author, title, body, created_at) values
('d0000000-0000-0000-0000-0000000000d1','Kritik güncelleme','#D9363E','Elif Kaya','Bu gece öncelik maske ve göz damlası stoğu','Saat 15:00''teki rüzgâr değişiminden sonra duman seviyesi yükseldi. Lütfen FFP2 maskelere ve serum fizyolojik göz damlalarına öncelik verin; her iki teslim noktası da 22:00''ye kadar giriş masasını açık tutacak.', now() - interval '18 minutes'),
('d0000000-0000-0000-0000-0000000000d1','Lojistik','#F97316','Hakan Öz','İkinci teslim noktası 20:00''de açılıyor','Çamlıyayla Okul Spor Salonu bu akşam ekipman, giyim ve pil kabul etmeye başlıyor. Ambulans şeridini açık tutmak için araçları doğu kapısından alın.', now() - interval '1 hour'),
('d0000000-0000-0000-0000-0000000000d1','Çözüldü','#159947','Elif Kaya','İçme suyu ihtiyacı tamamen karşılandı','Teşekkürler — 12.000 litre doğrulandı. Depo tıbbi malzemeler için boş kalsın diye lütfen su göndermeyi durdurun.', now() - interval '4 hours');

insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color, created_at) values
('d0000000-0000-0000-0000-0000000000d1','Elif Kaya','Teslimat doğrulandı','Tişört ve Gömlek · AFT-4812 · 40 adet','15 doğrulandı','55 doğrulandı','#159947', now() - interval '5 hours'),
('d0000000-0000-0000-0000-0000000000d1','Elif Kaya','Teslimat kısmen doğrulandı','İş Eldiveni · AFT-4818 · 20 çiftin 18''i','22 doğrulandı','40 doğrulandı','#F97316', now() - interval '3 hours'),
('d0000000-0000-0000-0000-0000000000d1','Elif Kaya','Miktar güncellendi','Islak Mendil gerekli miktarı artırıldı','250 gerekli','300 gerekli','#102A43', now() - interval '4 hours'),
('d0000000-0000-0000-0000-0000000000d1','Sistem','Teslimat bildirildi','Maske · AFT-4821 · 30 kutu','—','Doğrulama bekliyor','#E6A700', now() - interval '12 minutes'),
('d0000000-0000-0000-0000-0000000000d1','Elif Kaya','İhtiyaç oluşturuldu','Göz Damlası · Kritik','—','100 gerekli','#102A43', now() - interval '8 hours'),
('d0000000-0000-0000-0000-0000000000d1','Elif Kaya','Teslimat reddedildi','Kafa Lambası · AFT-4809 · 12 adet','Doğrulama bekliyor','Reddedildi','#D9363E', now() - interval '6 hours');

commit;
