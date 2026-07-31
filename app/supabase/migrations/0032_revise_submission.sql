-- AfetHUB — migration 0032
-- Verilmiş bir doğrulama kararını düzeltme ve geri alma.
--
-- Neden gerekli: sahada karar, teslimatın tamamı gelmeden veriliyor. "6 powerbank
-- bildirildi, 3'ü ulaştı" diye onaylanan bir kayıt, kalan 3 de geldiğinde 6 olmalı.
-- Bu yol olmadan koordinatörün tek çaresi ikinci bir sahte teslimat kaydı açmak —
-- yani veriyi düzeltmek için veriyi bozmak.
--
-- YETKİ: kararı VEREN koordinatör kendi kararını düzeltebilir; başkasınınkini
-- yalnızca yönetici düzeltir. 0031 öncesi kararlarda `decided_by` boş, onları da
-- yalnızca yönetici düzeltebilir (kimin verdiği bilinmiyor, tahmin edilmiyor).
--
-- GÖRÜNÜRLÜK: düzeltme ve geri alma satırları herkese açık akışa GİRMEZ —
-- `audit_is_public()` bir izin listesi ve bu iki aksiyon oraya eklenmiyor. Herkese
-- açık sayfadaki RAKAMLAR yine de anında doğrulanır, çünkü `needs` güncelleniyor;
-- değişmeyen tek şey akıştaki satır.
--
-- SAYILAR: sıfırdan yeniden hesaplama YAPILMIYOR. Mevcut kayıtlarda `verified_qty`
-- ve `pending_qty` değerlerinin bir kısmı arkasında teslimat satırı olmayan başlangıç
-- verisinden geliyor; sıfırdan hesap o operasyonların herkese açık sayılarını
-- sıfırlardı. Bunun yerine eski kararın etkisi `applied_qty` (0031) üzerinden birebir
-- geri alınıp yeni karar uygulanıyor.
--
-- Additive ve idempotent.
-- =============================================================================

create or replace function public.revise_submission(
  p_submission uuid,
  -- 'approve' | 'partial' | 'reject' | 'info' | 'undo'
  p_kind text,
  p_qty integer default null,
  p_reason text default null
) returns submissions
language plpgsql security definer set search_path to 'public' as $$
declare
  s submissions;
  n needs;
  actor_name text;
  old_status text;
  old_applied integer;
  old_pending_effect integer;   -- eski kararın pending_qty'den düşürdüğü miktar
  approved integer;
  base_v integer;               -- eski etki geri alındıktan sonraki doğrulanmış miktar
  new_v integer;
  new_pending integer;
  is_partial boolean;
  now_complete boolean;
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can revise deliveries';
  end if;
  if p_kind not in ('approve','partial','reject','info','undo') then
    raise exception 'Unknown revision kind: %', p_kind;
  end if;

  select * into s from submissions where id = p_submission for update;
  if not found then raise exception 'Submission not found'; end if;
  if s.decided_at is null then
    raise exception 'Submission has no decision to revise';
  end if;
  if not (is_admin() or (s.decided_by is not null and s.decided_by = auth.uid())) then
    raise exception 'Only the coordinator who decided this delivery, or an admin, may revise it';
  end if;

  select * into n from needs where id = s.need_id for update;
  select coalesce(full_name,'Koordinatör') into actor_name from profiles where id = auth.uid();

  old_status  := s.status::text;
  old_applied := coalesce(s.applied_qty, 0);
  -- 'Information requested' pending_qty'ye dokunmamıştı; ötekiler s.qty düşürmüştü.
  old_pending_effect := case when old_status = 'Information requested' then 0 else s.qty end;

  -- ---- eski etkiyi geri al -------------------------------------------------
  base_v      := greatest(0, n.verified_qty - old_applied);
  new_pending := n.pending_qty + old_pending_effect;

  -- ---- yeni kararı uygula --------------------------------------------------
  if p_kind = 'undo' then
    update submissions set
      status = 'Pending verification', verified_qty = null, applied_qty = null,
      decided_at = null, decided_by = null,
      note = coalesce(p_reason, 'Karar geri alındı, teslimat yeniden doğrulama bekliyor.')
      where id = s.id returning * into s;
    new_v := base_v;
    -- Kayıt kuyruğa döndüğü için beklenen miktar yerinde kalır (yukarıda eklendi).

  elsif p_kind = 'reject' then
    update submissions set
      status = 'Rejected', verified_qty = 0, applied_qty = 0,
      decided_at = now(), decided_by = auth.uid(),
      note = coalesce(p_reason, 'Düzeltme: teslim noktasında doğrulanamadı.')
      where id = s.id returning * into s;
    new_v := base_v;
    new_pending := greatest(0, new_pending - s.qty);

  elsif p_kind = 'info' then
    update submissions set
      status = 'Information requested', verified_qty = null, applied_qty = 0,
      decided_at = now(), decided_by = auth.uid(),
      note = coalesce(p_reason, 'Düzeltme: bağışçıdan ek bilgi istendi.')
      where id = s.id returning * into s;
    new_v := base_v;
    -- 'info' beklenen miktara dokunmaz: kayıt hâlâ karara bağlanmayı bekliyor.

  else
    approved := greatest(0, least(coalesce(p_qty, s.qty), s.qty));
    new_v      := least(n.required_qty, base_v + approved);
    is_partial := approved < s.qty;
    update submissions set
      status = (case when is_partial then 'Partially verified' else 'Verified' end)::submission_status,
      verified_qty = approved,
      applied_qty = new_v - base_v,
      decided_at = now(), decided_by = auth.uid(),
      note = coalesce(p_reason,
        case when is_partial then 'Düzeltme: '||approved||' adet doğrulandı.'
             else 'Düzeltme: teslimatın tamamı doğrulandı.' end)
      where id = s.id returning * into s;
    new_pending := greatest(0, new_pending - s.qty);
  end if;

  now_complete := (n.required_qty - new_v) <= 0;

  update needs set
    verified_qty = new_v,
    pending_qty  = new_pending,
    -- Tamamlanmış bir ihtiyaç düzeltme sonucu tekrar açılabilir; öncelik o zaman
    -- 'Completed' kalmamalı, yoksa ekranlarda karşılanmış görünür.
    priority = case
      when now_complete then 'Completed'::need_priority
      when priority = 'Completed'::need_priority then 'Normal'::need_priority
      else priority end,
    updated_at = now()
    where id = n.id;

  insert into audit_log(disaster_id, actor, action, detail, old_value, new_value, color)
    values (n.disaster_id, actor_name,
      case when p_kind = 'undo' then 'Teslimat kararı geri alındı' else 'Teslimat kararı düzeltildi' end,
      n.name||' · '||s.code||' · '||s.qty||' '||s.unit||' bildirildi'
        || coalesce(' · gerekçe: '||nullif(btrim(p_reason),''), ''),
      old_status||' · '||n.verified_qty||' doğrulanmış',
      s.status::text||' · '||new_v||' doğrulanmış',
      case when p_kind = 'undo' then '#627D98' else '#F97316' end);

  return s;
end $$;

revoke all on function public.revise_submission(uuid, text, integer, text) from public, anon;
grant execute on function public.revise_submission(uuid, text, integer, text) to authenticated;

notify pgrst, 'reload schema';
