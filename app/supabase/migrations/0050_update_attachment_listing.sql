-- 0050 — Saha güncellemesi eklerinin koordinatör listesi (Faz 4-A)
--
-- Moderasyon çekmecesi bir güncellemenin fotoğraflarını (bekleyen + karar
-- verilmiş) göstermek zorunda; `operation_update_attachments` tablosu ise
-- istemci rollerine bilinçli olarak KAPALI (0041). Var olan yüzeyler yetmiyor:
-- `operation_media_public` yalnızca onaylı VE yayımlanmış olanı gösteriyor,
-- kuyruk fonksiyonu yalnızca sayı taşıyor. Bu fonksiyon aradaki tek eksik
-- okuma yolu. `get_delivery_pledge_contact`tan farklı olarak gerekçe İSTEMİYOR:
-- fotoğrafın kendisi moderasyonun konusu — bakılmadan karar verilemez — ve
-- kişisel veri değil kanıt niteliğinde; erişim yine de koordinatörle sınırlı.
create or replace function list_update_attachments(p_update uuid)
returns table (
  id uuid, storage_path text, file_type text, file_size integer,
  width integer, height integer, caption text, captured_at timestamptz,
  public_location_text text, moderation_status text, moderation_reason text,
  created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can list update attachments';
  end if;
  return query
    select a.id, a.storage_path, a.file_type, a.file_size,
           a.width, a.height, a.caption, a.captured_at,
           a.public_location_text, a.moderation_status,
           coalesce(a.moderation_reason, ''), a.created_at
      from operation_update_attachments a
     where a.operation_update_id = p_update
     order by a.created_at asc;
end $$;

revoke all on function list_update_attachments(uuid) from public, anon;
grant execute on function list_update_attachments(uuid) to authenticated;
