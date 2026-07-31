-- AfetHUB — migration 0025
-- Koordinatör panelinin veri katmanı: tüm afetleri kapsayan genel görünüm.
--
-- Bugüne kadar panel tek bir operasyonun snapshot'ından besleniyordu. Yeni ana panel
-- koordinatörün eriştiği BÜTÜN afetleri aynı ekranda gösteriyor; bunun için üç şey
-- gerekiyordu ve üçü de burada:
--
--   1. Var olmayan alanlar (teslim noktası doluluğu, karar zamanı, afet koordinatı).
--   2. Aciliyet skorunun tek bir tanımı — tarayıcıda değil, veritabanında.
--   3. Koordinatöre özel iki okuma noktası (genel görünüm + birleşik kuyruk).
--
-- Additive ve idempotent. Hiçbir operasyonel veri silinmiyor veya yeniden yazılmıyor.
-- =============================================================================

-- ---------- 1) Teslim noktası doluluğu ---------------------------------------
-- Koordinatörün elle girdiği bir ölçüm. NULL = bilinmiyor ve öyle kalır: doluluğu
-- olmayan bir noktaya %0 yazmak, ekranda "yer var" diye okunur ve sevkiyat oraya
-- yönlendirilir. Uydurulmuş bir sayı burada yanlış kamyon demek (CLAUDE.md
-- §Source of Truth, rules/04 §Empty States).
alter table locations
  add column if not exists capacity_pct smallint,
  add column if not exists capacity_note text not null default '',
  add column if not exists capacity_updated_at timestamptz;

do $$ begin
  alter table locations
    add constraint locations_capacity_pct_range
      check (capacity_pct is null or (capacity_pct >= 0 and capacity_pct <= 100));
exception when duplicate_object then null; end $$;

comment on column locations.capacity_pct is
  'Coordinator-entered fill level, 0-100. NULL = unknown; never render as 0.';
comment on column locations.capacity_updated_at is
  'When the fill level was last set. A stale figure must be shown as stale, not as current.';

-- ---------- 2) Teslimat kararının zamanı -------------------------------------
-- `submissions` bugüne kadar yalnızca `submitted_at` taşıyordu, karar zamanı yoktu.
-- Panelin "bugün doğrulanan" sayacı bu yüzden aslında TÜM doğrulanmışları sayıyordu.
--
-- Geçmişe dönük doldurulmuyor: denetim kaydından türetilen bir zaman damgası,
-- gerçekte ne zaman karar verildiğini bilmediğimiz hâlde biliyormuş gibi görünürdü.
-- Eski satırlar NULL kalır ve günlük sayaca girmez.
alter table submissions
  add column if not exists decided_at timestamptz;

comment on column submissions.decided_at is
  'When a coordinator decided this submission (verify / partial / reject / info). '
  'NULL for rows decided before migration 0025 — deliberately not backfilled.';

create index if not exists submissions_decided_at_idx
  on submissions (decided_at desc) where decided_at is not null;

create index if not exists submissions_pending_idx
  on submissions (disaster_id, submitted_at) where status = 'Pending verification';

-- ---------- 3) Afetin harita koordinatı --------------------------------------
-- Ana paneldeki Türkiye haritası için. NULL olduğunda görünüm, o afetin teslim
-- noktalarının ortalamasına düşer; hiç nokta da yoksa afet haritada gösterilmez
-- (listede durur). Yaklaşık bir il merkezi uydurmak, işareti yanlış yere koyar.
alter table disasters
  add column if not exists lat numeric,
  add column if not exists lng numeric;

comment on column disasters.lat is
  'Operation centre for the national map. NULL = fall back to the mean of its delivery points.';

-- ---------- 4) SLA eşiği ------------------------------------------------------
-- Bekleyen bir teslimat kaç saat sonra "gecikmiş" sayılır. Tek yerde tanımlı: ekran,
-- skor ve kuyruk aynı sayıyı kullanır.
create or replace function afethub_sla_hours()
returns integer language sql immutable set search_path to 'public' as $$ select 24 $$;

-- ---------- 5) Aciliyet skoru -------------------------------------------------
-- Ana panel afetleri bu sayıya göre sıralar. Formül burada, tek bir yerde durur:
-- tarayıcıda hesaplanan bir "aciliyet" iki ekranda iki farklı sıralama üretirdi
-- (rules/05 §Architecture: yetkili hesap React bileşeninde durmaz).
--
-- Bileşenler ayrı ayrı da döndürülür (coordinator_overview) — koordinatör 96'nın
-- nereden geldiğini görebilmeli, yoksa sayı sihirli bir rakama dönüşür ve güvenilmez.
--
-- Ağırlıklar:
--   kritik ihtiyaç        ×12   — karşılanmayan kritik kalem en pahalı sinyal
--   acil ihtiyaç          × 4
--   bekleyen doğrulama    × 2   — kuyruk uzuyorsa operasyon tıkanıyor demektir
--   SLA aşan bekleme      × 6   — bekleyenin *yaşlısı* ayrıca cezalandırılır
--   kurulumu eksik        +15   — aktif ama teslim noktası yok: halka açık sayfa boş
--   düşük karşılama       +0..25 — (1 - karşılama oranı) × 25
-- Aktif olmayan operasyon 20 ile sınırlanır: arşivlenmiş bir kayıt paneli meşgul etmez.
create or replace function afethub_urgency_score(
  p_status         text,
  p_critical       integer,
  p_urgent         integer,
  p_pending        integer,
  p_sla_breached   integer,
  p_delivery_points integer,
  p_required       numeric,
  p_verified       numeric
) returns integer language sql immutable set search_path to 'public' as $$
  select least(100, greatest(0, case when p_status = 'Active' then s else least(s, 20) end))
  from (
    select (
      coalesce(p_critical, 0) * 12
      + coalesce(p_urgent, 0) * 4
      + coalesce(p_pending, 0) * 2
      + coalesce(p_sla_breached, 0) * 6
      + case when p_status = 'Active' and coalesce(p_delivery_points, 0) = 0 then 15 else 0 end
      + case
          when coalesce(p_required, 0) > 0
            then round((1 - least(1, coalesce(p_verified, 0) / p_required)) * 25)
          else 0
        end
    )::integer as s
  ) q;
$$;

-- ---------- 6) verify_submission: karar zamanını damgala ----------------------
-- Var olan işlev birebir korunuyor; tek değişiklik her karar dalında `decided_at`
-- yazılması. Sayacın kaynağı istemci değil, kararın kendisi olmalı.
create or replace function public.verify_submission(
  p_submission uuid, p_kind text, p_qty integer default null, p_reason text default null
) returns submissions
language plpgsql security definer set search_path to 'public' as $function$
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
    status = case when is_partial then 'Partially verified' else 'Verified' end,
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
end $function$;

-- ---------- 7) Teslim noktası doluluğunu yazan işlev --------------------------
-- Ayrı bir RPC, çünkü doluluk operasyonel bir karardır ve denetim kaydına düşer.
-- p_pct null gönderildiğinde ölçüm "bilinmiyor"a döner — geri alınabilir olmalı.
create or replace function set_location_capacity(
  p_location uuid, p_pct smallint, p_note text default ''
) returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  l locations;
  actor_name text;
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can set delivery point capacity';
  end if;
  if p_pct is not null and (p_pct < 0 or p_pct > 100) then
    raise exception 'Capacity must be between 0 and 100';
  end if;

  select * into l from locations where id = p_location for update;
  if not found then raise exception 'Delivery point not found'; end if;

  select coalesce(full_name,'Coordinator') into actor_name from profiles where id = auth.uid();

  update locations
     set capacity_pct = p_pct,
         capacity_note = coalesce(p_note, ''),
         capacity_updated_at = now()
   where id = l.id;

  insert into audit_log(disaster_id, actor, action, detail, old_value, new_value, color)
    values (l.disaster_id, actor_name, 'Teslim noktası doluluğu güncellendi',
      l.name,
      coalesce(l.capacity_pct::text || '%', 'bilinmiyor'),
      coalesce(p_pct::text || '%', 'bilinmiyor'),
      '#2A6FB0');
end $$;

revoke all on function set_location_capacity(uuid, smallint, text) from public, anon;
grant execute on function set_location_capacity(uuid, smallint, text) to authenticated;

-- ---------- 8) Koordinatör genel görünümü ------------------------------------
-- Panelin ana sorgusu. Tek çağrı: yedi afet için yedi ayrı snapshot çağrısı panelin
-- açılışını yavaşlatırdı (rules/05 §Performance).
--
-- Görünüm değil RPC, çünkü satırlar koordinatöre özel sayılar taşıyor ve bir view'e
-- RLS uygulanamıyor. Yetki burada, ekranın ulaşılması zor olmasında değil
-- (rules/03 §Server-Side Authorization).
create or replace function coordinator_overview()
returns table (
  disaster_id uuid,
  slug text,
  name text,
  province text,
  region text,
  type text,
  status text,
  opened_at date,
  is_demo boolean,
  lat numeric,
  lng numeric,
  critical_needs integer,
  urgent_needs integer,
  open_needs integer,
  completed_needs integer,
  required_total numeric,
  verified_total numeric,
  pending_subs integer,
  pending_units numeric,
  sla_breached integer,
  decided_today integer,
  delivery_points integer,
  points_at_capacity integer,
  points_capacity_unknown integer,
  volunteers integer,
  on_shift integer,
  pending_volunteers integer,
  open_need_requests integer,
  last_activity_at timestamptz,
  urgency integer
)
language plpgsql security definer set search_path to 'public' as $$
-- RETURNS TABLE creates OUT variables named like real columns (name, slug, status…).
-- Without this, every such reference inside the query is ambiguous and the function
-- fails at runtime rather than at create time.
#variable_conflict use_column
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can read the coordination overview';
  end if;

  return query
  with per as (
    -- Takma adlar bilerek "d_" / "p_" önekli: RETURNS TABLE bu isimlerin aynısını OUT
    -- değişkeni olarak da tanımlıyor ve önek olmadan her başvuru belirsiz kalıyor.
    select
      d.id as d_id, d.slug as d_slug, d.name as d_name, d.province as d_province,
      d.region as d_region, d.type::text as d_type, d.status::text as d_status,
      d.opened_at as d_opened_at, d.is_demo as d_is_demo, d.lat as d_lat, d.lng as d_lng,
      (select count(*)::int from needs n
         where n.disaster_id = d.id and n.priority = 'Critical' and n.remaining_qty > 0) as p_critical,
      (select count(*)::int from needs n
         where n.disaster_id = d.id and n.priority = 'Urgent' and n.remaining_qty > 0)   as p_urgent,
      (select count(*)::int from needs n
         where n.disaster_id = d.id and n.remaining_qty > 0)                             as p_open,
      (select count(*)::int from needs n
         where n.disaster_id = d.id and n.remaining_qty = 0)                             as p_completed,
      (select coalesce(sum(n.required_qty), 0)::numeric from needs n
         where n.disaster_id = d.id)                                                     as p_required,
      (select coalesce(sum(n.verified_qty), 0)::numeric from needs n
         where n.disaster_id = d.id)                                                     as p_verified,
      (select count(*)::int from submissions s
         where s.disaster_id = d.id and s.status = 'Pending verification')               as p_pending,
      (select coalesce(sum(s.qty), 0)::numeric from submissions s
         where s.disaster_id = d.id and s.status = 'Pending verification')               as p_pending_units,
      (select count(*)::int from submissions s
         where s.disaster_id = d.id and s.status = 'Pending verification'
           and s.submitted_at < now() - make_interval(hours => afethub_sla_hours()))     as p_sla,
      (select count(*)::int from submissions s
         where s.disaster_id = d.id
           and s.status in ('Verified','Partially verified')
           and s.decided_at >= date_trunc('day', now()))                                 as p_today,
      (select count(*)::int from locations l where l.disaster_id = d.id)                 as p_points,
      -- %85 ve üstü "kapasitede" sayılır: koordinatör yeni sevkiyatı yönlendirmek için
      -- nokta tamamen dolmadan önce uyarılmalı.
      (select count(*)::int from locations l
         where l.disaster_id = d.id and l.capacity_pct is not null and l.capacity_pct >= 85) as p_full,
      (select count(*)::int from locations l
         where l.disaster_id = d.id and l.capacity_pct is null)                          as p_unknown,
      d.volunteers as d_volunteers, d.on_shift as d_on_shift,
      (select count(*)::int from volunteer_applications v
         where v.disaster_id = d.id and v.status = 'Pending review')                     as p_vol_pending,
      (select count(*)::int from need_requests r
         where r.disaster_id = d.id and r.status = 'Waiting for verification')           as p_need_req,
      (select max(a.created_at) from audit_log a where a.disaster_id = d.id)             as p_last,
      -- Afetin kendi koordinatı yoksa teslim noktalarının ortalaması. Hiç nokta da
      -- yoksa null kalır ve afet haritada gösterilmez — yaklaşık bir il merkezi
      -- uydurmak işareti yanlış yere koyardı.
      (select avg(l.lat) from locations l where l.disaster_id = d.id and l.lat is not null) as p_flat,
      (select avg(l.lng) from locations l where l.disaster_id = d.id and l.lng is not null) as p_flng
    from disasters d
  )
  select
    per.d_id, per.d_slug, per.d_name, per.d_province, per.d_region, per.d_type, per.d_status,
    per.d_opened_at, per.d_is_demo,
    coalesce(per.d_lat, per.p_flat),
    coalesce(per.d_lng, per.p_flng),
    per.p_critical, per.p_urgent, per.p_open, per.p_completed,
    per.p_required, per.p_verified,
    per.p_pending, per.p_pending_units, per.p_sla, per.p_today,
    per.p_points, per.p_full, per.p_unknown,
    per.d_volunteers, per.d_on_shift, per.p_vol_pending, per.p_need_req,
    per.p_last,
    afethub_urgency_score(per.d_status, per.p_critical, per.p_urgent,
      per.p_pending, per.p_sla, per.p_points,
      per.p_required, per.p_verified)
  from per
  order by 30 desc, 3;   -- 30 = urgency, 3 = name
end $$;

revoke all on function coordinator_overview() from public, anon;
grant execute on function coordinator_overview() to authenticated;

-- ---------- 9) Birleşik iş kuyruğu -------------------------------------------
-- Bekleyen teslimatlar, hangi afete ait olduğu ile birlikte, tek listede.
--
-- Bağışçının e-postası ve telefonu BİLEREK dönmüyor: kuyruk satırı bir karar vermek
-- için okunur, kişiyle iletişim kurmak için değil. İletişim bilgisi tek bir kaydın
-- detayında, ihtiyaç anında çekilir (rules/05 §Public and Private Views).
create or replace function coordinator_pending_queue(p_limit integer default 50)
returns table (
  submission_id uuid,
  code text,
  disaster_id uuid,
  disaster_slug text,
  disaster_name text,
  need_id uuid,
  need_name text,
  need_priority text,
  contributor text,
  qty integer,
  unit text,
  location_name text,
  note text,
  has_photo boolean,
  submitted_at timestamptz,
  waiting_hours integer,
  sla_breached boolean
)
language plpgsql security definer set search_path to 'public' as $$
#variable_conflict use_column
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can read the review queue';
  end if;

  return query
  select
    s.id, s.code, s.disaster_id, d.slug, d.name,
    s.need_id, n.name, n.priority::text,
    s.contributor_name, s.qty, s.unit, s.location_name, s.note,
    (s.photo_url is not null and s.photo_url <> ''),
    s.submitted_at,
    (extract(epoch from (now() - s.submitted_at)) / 3600)::int,
    (s.submitted_at < now() - make_interval(hours => afethub_sla_hours()))
  from submissions s
  join disasters d on d.id = s.disaster_id
  left join needs n on n.id = s.need_id
  where s.status = 'Pending verification'
  order by s.submitted_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end $$;

revoke all on function coordinator_pending_queue(integer) from public, anon;
grant execute on function coordinator_pending_queue(integer) to authenticated;

-- Not: bu migration hiçbir sayacı geriye doldurmaz ve hiçbir doluluk değeri yazmaz.
-- Panel açıldığında doluluk sütunu "bilinmiyor", "bugün doğrulanan" ise 0 gösterecek;
-- ikisi de gerçeği anlatır ve ilk karar verildiğinde kendiliğinden dolar.
