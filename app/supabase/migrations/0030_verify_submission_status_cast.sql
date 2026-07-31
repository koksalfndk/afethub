-- AfetHUB — migration 0030
-- HATA DÜZELTMESİ: onay/kısmi onay veritabanına yazılamıyordu.
--
-- Belirti: koordinatör panelinde "Onayla" hiçbir zaman işe yaramıyordu.
-- `submissions` tablosunda `decided_at is not null` olan tek bir satır yoktu ve
-- denetim kaydında tek bir doğrulama girdisi bulunmuyordu.
--
-- Sebep: aşağıdaki satır.
--
--   status = case when is_partial then 'Partially verified' else 'Verified' end
--
-- CASE'in her iki dalı da tipsiz metin sabiti olduğu için ifadenin tipi `text`e
-- çözülüyor; Postgres UPDATE SET içinde `text` → `submission_status` örtük
-- dönüşümüne izin vermiyor:
--   column "status" is of type submission_status but expression is of type text
--
-- Neden yalnızca bu dal: 'reject' ve 'info' dalları sabiti DOĞRUDAN sütuna atıyor
-- (status='Rejected'), orada sabit hedef sütunun tipinde çözülüyor ve çalışıyor.
-- Yani reddetme ve bilgi isteme çalışırken, en çok kullanılan işlem — onaylama —
-- her seferinde 400 dönüyordu. Üretim API kaydındaki üç 400 yanıtı, Postgres
-- kaydındaki üç ERROR satırıyla saniyesi saniyesine eşleşiyor.
--
-- Neden sessiz kaldı: istemci `rpc()` çağrısının `{ error }` alanını okumuyordu;
-- arayüz "onaylandı ✓" diyor, veritabanında hiçbir şey değişmiyordu. Bu da ayrıca
-- düzeltildi (supabaseRepo.verifySubmission).
--
-- Aynı tuzağın başka bir yerde olup olmadığı tarandı: `(status|priority|kind) = case`
-- kalıbı yalnızca bu fonksiyonda geçiyor.
--
-- Düzeltme: CASE sonucu açıkça enum'a çevriliyor. Fonksiyonun geri kalanı aynı.
-- Additive ve idempotent (create or replace).
-- =============================================================================

create or replace function public.verify_submission(
  p_submission uuid, p_kind text, p_qty integer default null, p_reason text default null
) returns submissions
language plpgsql security definer set search_path to 'public' as $$
declare
  s submissions;
  n needs;
  actor_name text;
  approved integer;
  before_v integer;
  after_v  integer;
  is_partial boolean;
  now_complete boolean;
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can verify deliveries';
  end if;

  select * into s from submissions where id = p_submission for update;
  if not found then raise exception 'Submission not found'; end if;
  select * into n from needs where id = s.need_id for update;

  select coalesce(full_name,'Coordinator') into actor_name from profiles where id = auth.uid();

  if p_kind = 'reject' then
    update submissions set status='Rejected', verified_qty=0, decided_at=now(),
      note=coalesce(p_reason,'Could not be verified at the drop-off point.')
      where id = s.id returning * into s;
    update needs set pending_qty = greatest(0, pending_qty - s.qty), updated_at=now()
      where id = n.id;
    insert into audit_log(disaster_id, actor, action, detail, old_value, new_value, color)
      values (n.disaster_id, actor_name, 'Delivery rejected',
        n.name||' · '||s.code||' · '||s.qty||' '||s.unit,
        'Pending verification','Rejected','#D9363E');
    return s;
  end if;

  if p_kind = 'info' then
    update submissions set status='Information requested', decided_at=now(),
      note=coalesce(p_reason,'Coordinator asked for a photo of the delivery.')
      where id = s.id returning * into s;
    insert into audit_log(disaster_id, actor, action, detail, old_value, new_value, color)
      values (n.disaster_id, actor_name, 'Information requested',
        n.name||' · '||s.code,'Pending verification','Information requested','#E6A700');
    return s;
  end if;

  approved := greatest(0, least(coalesce(p_qty, s.qty), s.qty));
  before_v := n.verified_qty;
  after_v  := least(n.required_qty, before_v + approved);
  is_partial := approved < s.qty;
  now_complete := (n.required_qty - after_v) <= 0;

  update submissions set
    -- ::submission_status — DÜZELTMENİN TAMAMI BU. Tipsiz iki sabitten oluşan CASE
    -- `text` üretiyordu ve enum sütuna atanamıyordu.
    status = (case when is_partial then 'Partially verified' else 'Verified' end)::submission_status,
    verified_qty = approved,
    decided_at = now(),
    note = coalesce(p_reason,
      case when is_partial then (s.qty - approved)||' items could not be verified.'
           else 'Counted and accepted at intake.' end)
    where id = s.id returning * into s;

  update needs set
    verified_qty = after_v,
    pending_qty  = greatest(0, pending_qty - s.qty),
    priority     = case when now_complete then 'Completed'::need_priority else priority end,
    updated_at   = now()
    where id = n.id;

  insert into audit_log(disaster_id, actor, action, detail, old_value, new_value, color)
    values (n.disaster_id, actor_name,
      case when is_partial then 'Delivery partially verified' else 'Delivery verified' end,
      n.name||' · '||s.code||' · '||approved||' of '||s.qty||' '||s.unit,
      before_v||' verified', after_v||' verified',
      case when is_partial then '#F97316' else '#159947' end);

  if now_complete then
    insert into audit_log(disaster_id, actor, action, detail, old_value, new_value, color)
      values (n.disaster_id, actor_name, 'Need completed',
        n.name||' reached its required amount','Active','Completed','#159947');
  end if;

  return s;
end $$;

-- Fonksiyon gövdesi değişti: PostgREST önbelleği tazelenmezse eski plan kullanılır.
notify pgrst, 'reload schema';
