-- 0047 — Teslim sözü listesinin dışa aktarımı denetim kaydına yazılıyor (Faz 3-D)
--
-- NEDEN
-- -----
-- CSV dışa aktarma, ekranda zaten görünen satırları dosyaya alır: yeni bir yetki
-- açmıyor, maskesiz hiçbir alan eklemiyor. Yine de ekranda gezinmekten farklı bir
-- şey: veri koordinatörün denetimindeki sistemden ÇIKIYOR ve dışarıda kopya olarak
-- yaşamaya başlıyor. rules/03 §Audit Log bu sınıf işlemler için kayıt istiyor;
-- `get_delivery_pledge_contact` de aynı gerekçeyle kayıt yazıyor.
--
-- KAPSAM
-- ------
-- Bu fonksiyon VERİ DÖNDÜRMÜYOR. Satırları hâlâ
-- `list_delivery_pledges_for_coordinator()` veriyor ve o fonksiyonun maskeleme ve
-- yetki kuralları olduğu gibi geçerli. Buradaki tek iş, "şu koordinatör şu
-- görünümün şu kadar satırını dışarı aldı" cümlesini denetim kaydına yazmak.
--
-- Ayrı bir `export_delivery_pledges()` yazıp liste sorgusunu ikinci kez kurmak da
-- mümkündü; iki sorgu zamanla ayrışır ve "ekranda gördüğüm liste ile indirdiğim
-- dosya neden farklı" sorusunu üretir. Tek sorgu, tek doğruluk.
--
-- Dışa aktarılan satır sayısı kaydediliyor çünkü bir denetimde asıl soru "indirdi
-- mi" değil, "ne kadarını indirdi" oluyor.

create or replace function log_pledge_export(
  p_view      text,
  p_row_count integer,
  p_disaster  uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  v_view     text;
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can export delivery pledges';
  end if;

  -- Görünüm adı denetim kaydına serbest metin olarak GİRMİYOR: istemciden gelen
  -- bir dize, denetim kaydına istediğini yazmanın yolu olurdu. Bilinen değerler
  -- dışındaki her şey 'bilinmeyen' olarak kaydediliyor.
  v_view := case when p_view in ('all','today','upcoming','overdue','transit',
                                 'reported','done','cancelled','expired')
                 then p_view else 'bilinmeyen' end;

  select coalesce(full_name, 'Koordinatör') into actor_name from profiles where id = auth.uid();

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (p_disaster, coalesce(actor_name, 'Koordinatör'),
          'Teslim sözü listesi dışa aktarıldı',
          v_view, '—', greatest(coalesce(p_row_count, 0), 0)::text || ' satır', '#8A94A6');
end $$;
revoke all on function log_pledge_export(text, integer, uuid) from public, anon;
grant execute on function log_pledge_export(text, integer, uuid) to authenticated;

-- Eylem herkese açık akışa DÜŞMÜYOR: `audit_is_public()` listesine eklenmedi.
-- Kimin hangi listeyi indirdiği operasyonel bir iç bilgidir.

notify pgrst, 'reload schema';
