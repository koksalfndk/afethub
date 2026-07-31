-- AfetHUB — migration 0031
-- Doğrulama kararı: Türkçe kayıt metni + kararı kimin verdiği + uygulanan miktar.
--
-- 1) DİL. `verify_submission` denetim kaydına ve bağışçının gördüğü nota İngilizce
--    yazıyordu ("Delivery verified", "30 of 30 kutu", "Counted and accepted at
--    intake."). Ürünün tamamı Türkçe ve bu satırlar herkese açık akışta da görünüyor;
--    aynı olayın Türkçe adları zaten kullanımdaydı, bu bir birleştirme.
--
--    Mevcut İngilizce satırlar DEĞİŞTİRİLMİYOR — `audit_log` bir immutability
--    trigger'ı taşıyor ve denetim kaydının geçmişe dönük düzeltilmemesi kasıtlı:
--    sonradan düzeltilebilen bir olay kaydı, kayıt değildir. Onlar arayüzde
--    görüntüleme anında eşleniyor (data/repo.ts → auditActionLabel).
--
-- 2) KARARI KİM VERDİ. `submissions.decided_by`. Düzeltme yetkisi buna bakıyor
--    (0032): kararı veren koordinatör kendi kararını düzeltebilir, başkasınınkini
--    yönetici düzeltir. Alan olmadan "kimin kararı" sorusunun tek cevabı denetim
--    kaydındaki serbest metin olurdu ve ona sorgu yazılamaz.
--
-- 3) UYGULANAN MİKTAR. `submissions.applied_qty` — bu kararın `needs.verified_qty`
--    değerine GERÇEKTEN eklediği miktar. Onaylanan miktarla aynı olmayabilir:
--    ihtiyaç tamamlanmışsa fazlası tavana takılıyor. Düzeltmenin eski etkiyi birebir
--    geri alabilmesi için uygulanan değerin kendisi saklanmalı.
--
--    Sayılar sıfırdan yeniden hesaplanamaz: mevcut kayıtlarda `verified_qty` ve
--    `pending_qty` değerlerinin bir kısmı arkasında teslimat kaydı olmayan başlangıç
--    verisinden geliyor. Sıfırdan hesap, o operasyonların herkese açık sayılarını
--    sıfırlardı. Bu yüzden delta.
--
-- Ayrıca: karara bağlanmış bir kayıt bu fonksiyonla ikinci kez işlenemiyor. Aynı
-- teslimatı iki kez onaylamak, ihtiyacın doğrulanmış miktarını iki kez artırıyordu.
--
-- Additive ve idempotent.
-- =============================================================================

alter table submissions
  add column if not exists decided_by uuid references profiles(id) on delete set null,
  add column if not exists applied_qty integer;

comment on column submissions.decided_by is
  'Coordinator who decided this submission. NULL for rows decided before migration 0031 — those can only be corrected by an admin.';
comment on column submissions.applied_qty is
  'How much this decision actually added to needs.verified_qty (may be less than verified_qty when the need was already complete). NULL = never applied.';

create index if not exists submissions_decided_by_idx on submissions(decided_by);

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
  -- Karara bağlanmış bir kayıt bu fonksiyonla ikinci kez işlenemez; düzeltme ayrı
  -- bir yoldan (revise_submission) geçer ve eski etkiyi geri alır.
  if s.decided_at is not null then
    raise exception 'Submission already decided';
  end if;
  select * into n from needs where id = s.need_id for update;

  select coalesce(full_name,'Koordinatör') into actor_name from profiles where id = auth.uid();

  if p_kind = 'reject' then
    update submissions set status='Rejected', verified_qty=0, applied_qty=0,
      decided_at=now(), decided_by=auth.uid(),
      note=coalesce(p_reason,'Teslim noktasında doğrulanamadı.')
      where id = s.id returning * into s;
    update needs set pending_qty = greatest(0, pending_qty - s.qty), updated_at=now()
      where id = n.id;
    insert into audit_log(disaster_id, actor, action, detail, old_value, new_value, color)
      values (n.disaster_id, actor_name, 'Teslimat reddedildi',
        n.name||' · '||s.code||' · '||s.qty||' '||s.unit,
        'Doğrulama bekliyor','Reddedildi','#D9363E');
    return s;
  end if;

  if p_kind = 'info' then
    update submissions set status='Information requested',
      decided_at=now(), decided_by=auth.uid(),
      note=coalesce(p_reason,'Koordinatör teslimatın fotoğrafını istedi.')
      where id = s.id returning * into s;
    insert into audit_log(disaster_id, actor, action, detail, old_value, new_value, color)
      values (n.disaster_id, actor_name, 'Bilgi istendi',
        n.name||' · '||s.code,'Doğrulama bekliyor','Bilgi istendi','#E6A700');
    return s;
  end if;

  approved := greatest(0, least(coalesce(p_qty, s.qty), s.qty));
  before_v := n.verified_qty;
  after_v  := least(n.required_qty, before_v + approved);
  is_partial := approved < s.qty;
  now_complete := (n.required_qty - after_v) <= 0;

  update submissions set
    status = (case when is_partial then 'Partially verified' else 'Verified' end)::submission_status,
    verified_qty = approved,
    -- Tavana takılmışsa gerçekten eklenen bu kadar; düzeltme bunu geri alacak.
    applied_qty = after_v - before_v,
    decided_at = now(),
    decided_by = auth.uid(),
    note = coalesce(p_reason,
      case when is_partial then (s.qty - approved)||' adedi doğrulanamadı.'
           else 'Teslim noktasında sayıldı ve kabul edildi.' end)
    where id = s.id returning * into s;

  update needs set
    verified_qty = after_v,
    pending_qty  = greatest(0, pending_qty - s.qty),
    priority     = case when now_complete then 'Completed'::need_priority else priority end,
    updated_at   = now()
    where id = n.id;

  insert into audit_log(disaster_id, actor, action, detail, old_value, new_value, color)
    values (n.disaster_id, actor_name,
      case when is_partial then 'Teslimat kısmen doğrulandı' else 'Teslimat doğrulandı' end,
      n.name||' · '||s.code||' · '||s.qty||' '||s.unit||' bildirildi, '||approved||' doğrulandı',
      before_v||' doğrulanmış', after_v||' doğrulanmış',
      case when is_partial then '#F97316' else '#159947' end);

  if now_complete then
    insert into audit_log(disaster_id, actor, action, detail, old_value, new_value, color)
      values (n.disaster_id, actor_name, 'İhtiyaç tamamlandı',
        n.name||' gerekli miktara ulaştı','Aktif','Tamamlandı','#159947');
  end if;

  return s;
end $$;

notify pgrst, 'reload schema';
