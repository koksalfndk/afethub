-- AfetHUB — migration 0036
-- Operasyon aşaması: halka açık sayfada "Aktif" etiketinin anlatamadığı şeyi anlatan
-- alan. Bir ziyaretçinin ilk sorusu "yangın sürüyor mu, söndü mü" ve `status = Active`
-- bunun cevabı değil; operasyon kaydı arşivlenene kadar aktiftir.
--
-- MEVCUT `disasters.status` DEĞİŞTİRİLMEDİ. Direktif ana kayıt durumu için
-- draft/active/paused/resolved/archived öneriyor; `disaster_status` enum'u bugün
-- Active/Resolved/Archived ve bu üç değer arayüzde, `afethub_urgency_score()` içinde,
-- `coordinator_overview()` içinde ve `DisasterInput` tipinde yazılı. Enum'u genişletmek
-- Faz 1'in kapsamı dışında bir dalga yaratırdı ve aşama alanı zaten sorulan soruyu
-- cevaplıyor. İki alan ayrı yaşar: `status` KAYDIN durumu, `operation_stage` SAHANIN.
--
-- Aşama NULL olabilir ve NULL "belirtilmedi" demektir — asla tahmin edilmez. Mevcut
-- operasyonlara geriye dönük bir aşama yazmak, koordinatörün söylemediği bir şeyi
-- herkese açık sayfada söylemek olurdu (rules/04 §Empty States).
--
-- Additive ve idempotent.
-- =============================================================================

-- ---------- 1) Aşama tipi ----------------------------------------------------
-- Sıra kasıtlı: müdahaleden izlemeye doğru. Enum sırası `order by` için kullanılabilir
-- olsun diye tanımlandı, ama hiçbir yerde "ilerleme" olarak yorumlanmıyor — bir
-- operasyon tahliyeden yoğun müdahaleye geri dönebilir.
do $$ begin
  create type operation_stage as enum (
    'initial_response',    -- İlk Müdahale
    'intensive_response',  -- Yoğun Müdahale
    'evacuation',          -- Tahliye
    'cooling',             -- Soğutma Çalışmaları
    'recovery',            -- İyileştirme
    'monitoring',          -- İzleme
    'completed'            -- Tamamlandı
  );
exception when duplicate_object then null; end $$;

-- ---------- 2) Sütunlar ------------------------------------------------------
alter table disasters
  add column if not exists operation_stage        operation_stage,
  -- Koordinatörün yazdığı kısa açıklama. Etiket tek başına yeterli değil: "Soğutma
  -- Çalışmaları" ne yapılması gerektiğini söylemiyor, altındaki cümle söylüyor.
  add column if not exists operation_stage_note   text not null default '',
  add column if not exists operation_stage_set_at timestamptz,
  add column if not exists operation_stage_set_by uuid references auth.users(id) on delete set null;

do $$ begin
  alter table disasters
    add constraint disasters_stage_note_len check (length(operation_stage_note) <= 400);
exception when duplicate_object then null; end $$;

-- Aşama yazılmadan not yazılamaz: açıklaması olan ama etiketi olmayan bir kayıt,
-- arayüzde başlıksız bir paragraf demek olurdu.
do $$ begin
  alter table disasters
    add constraint disasters_stage_note_needs_stage
      check (operation_stage is not null or btrim(operation_stage_note) = '');
exception when duplicate_object then null; end $$;

comment on column disasters.operation_stage is
  'Public operation phase. NULL means "not stated" and must be rendered as such — never guessed.';

-- ---------- 3) Öne çıkarılan ihtiyaçlar --------------------------------------
-- "Şu anda en çok ihtiyaç duyulan destek" satırı. Ayrı bir `featured_operation_needs`
-- tablosu yerine `needs` üzerinde bir sütun: kayıt zaten tam olarak bir operasyona ait
-- ve bir ihtiyaç en fazla bir kez öne çıkabilir. Ayrı tablo, aynı gerçeği ikinci bir
-- yerde saklamak ve iki yeri tutarlı tutmak zorunda kalmak olurdu
-- (rules/06 §Scope Control — "Avoid creating duplicate systems").
alter table needs
  add column if not exists featured_rank smallint;

do $$ begin
  alter table needs
    add constraint needs_featured_rank_range
      check (featured_rank is null or featured_rank between 1 and 4);
exception when duplicate_object then null; end $$;

-- Aynı operasyonda iki ihtiyaç aynı sırayı alamaz. Kısmi indeks: öne çıkarılmamış
-- kalemler (NULL) sınırsız.
create unique index if not exists needs_featured_rank_uniq
  on needs (disaster_id, featured_rank)
  where featured_rank is not null;

comment on column needs.featured_rank is
  'Coordinator-picked highlight slot (1-4) for the "most needed right now" line. NULL = not featured.';

-- ---------- 4) Aşamayı yazan RPC ---------------------------------------------
-- Ayrı bir RPC, doğrudan UPDATE değil: aşama değişikliği herkese açık sayfanın en
-- görünür cümlesini değiştiriyor ve gerekçesiyle birlikte denetim kaydına düşmeli
-- (rules/03 §Audit Log). `needs`/`locations` gibi tetikleyici kullanılmadı, çünkü
-- gerekçe metni satırda saklanmıyor — yalnızca kayda yazılıyor.
create or replace function set_operation_stage(
  p_disaster uuid,
  p_stage    operation_stage,
  p_note     text default '',
  p_reason   text default ''
) returns void
language plpgsql security definer set search_path = public as $$
declare
  d          disasters;
  actor_name text;
  v_before   text;
  v_after    text;
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can change the operation stage';
  end if;
  if length(coalesce(p_note, '')) > 400 then
    raise exception 'Stage note is too long';
  end if;
  -- Aşamayı kaldırmak ("belirtilmedi"e dönmek) mümkün olmalı: yanlış girilen bir
  -- aşama, geri alınamıyorsa herkese açık sayfada kalır.
  if p_stage is null and btrim(coalesce(p_note, '')) <> '' then
    raise exception 'A stage note requires a stage';
  end if;

  select * into d from disasters where id = p_disaster for update;
  if not found then raise exception 'Operation not found'; end if;

  select coalesce(full_name, 'Koordinatör') into actor_name from profiles where id = auth.uid();

  update disasters set
    operation_stage        = p_stage,
    operation_stage_note   = coalesce(p_note, ''),
    operation_stage_set_at = now(),
    operation_stage_set_by = auth.uid(),
    updated_at             = now()
  where id = d.id;

  v_before := coalesce(d.operation_stage::text, 'belirtilmedi');
  v_after  := coalesce(p_stage::text, 'belirtilmedi');

  -- Aşama değişmeden yalnızca açıklama düzeltildiyse de kayıt düşer: herkese açık
  -- cümle değişti ve kimin değiştirdiği kayıtlı olmalı.
  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (
    d.id, actor_name, 'Operasyon aşaması güncellendi',
    d.name || case when btrim(coalesce(p_reason, '')) <> '' then ' · ' || btrim(p_reason) else '' end,
    v_before, v_after, '#2A6FB0'
  );
end $$;

revoke all on function set_operation_stage(uuid, operation_stage, text, text) from public, anon;
grant execute on function set_operation_stage(uuid, operation_stage, text, text) to authenticated;

-- ---------- 5) Öne çıkan ihtiyaçları yazan RPC -------------------------------
-- Tek çağrıda tüm liste: sıralar kısmi tekil indekse tabi, kalemleri tek tek
-- güncellemek aradaki her adımda çakışma riski demek olurdu.
create or replace function set_featured_needs(
  p_disaster uuid,
  p_need_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  v_before   text;
  v_after    text;
  i          integer;
  v_id       uuid;
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can feature needs';
  end if;
  if coalesce(array_length(p_need_ids, 1), 0) > 4 then
    raise exception 'At most 4 needs can be featured';
  end if;

  perform 1 from disasters where id = p_disaster for update;
  if not found then raise exception 'Operation not found'; end if;

  select coalesce(full_name, 'Koordinatör') into actor_name from profiles where id = auth.uid();

  select coalesce(string_agg(name, ', ' order by featured_rank), '—')
    into v_before
    from needs where disaster_id = p_disaster and featured_rank is not null;

  -- Önce hepsini temizle, sonra sırayla yaz: aksi hâlde 1↔2 takası kısmi tekil
  -- indekse takılırdı.
  update needs set featured_rank = null
   where disaster_id = p_disaster and featured_rank is not null;

  i := 0;
  foreach v_id in array coalesce(p_need_ids, array[]::uuid[]) loop
    i := i + 1;
    update needs set featured_rank = i
     where id = v_id and disaster_id = p_disaster;
    if not found then
      raise exception 'Need % does not belong to this operation', v_id;
    end if;
  end loop;

  select coalesce(string_agg(name, ', ' order by featured_rank), '—')
    into v_after
    from needs where disaster_id = p_disaster and featured_rank is not null;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (p_disaster, actor_name, 'Öne çıkan ihtiyaçlar güncellendi', '', v_before, v_after, '#2A6FB0');
end $$;

revoke all on function set_featured_needs(uuid, uuid[]) from public, anon;
grant execute on function set_featured_needs(uuid, uuid[]) to authenticated;

-- ---------- 6) Herkese açık akışta görünen aksiyonlar ------------------------
-- İzin listesi (0016). Aşama değişikliği herkese açık: sayfanın kendisi zaten yazıyor,
-- akışta görünmemesi "kim ne zaman değiştirdi" sorusunu cevapsız bırakırdı.
-- "Öne çıkan ihtiyaçlar güncellendi" BİLEREK listede yok: editoryal bir vurgu kararı,
-- operasyonel bir olay değil.
create or replace function audit_is_public(p_action text)
returns boolean language sql immutable set search_path = public as $$
  select p_action = any (array[
    'İhtiyaç oluşturuldu', 'Miktar güncellendi', 'İhtiyaç tamamlandı', 'Need completed',
    'Teslimat bildirildi', 'Teslimat doğrulandı', 'Teslimat kısmen doğrulandı', 'Teslimat reddedildi',
    'Delivery verified', 'Delivery partially verified', 'Delivery rejected',
    'Duyuru yayınlandı', 'Duyuru güncellendi', 'Duyuru kaldırıldı',
    'Teslim noktası eklendi', 'Teslim noktası güncellendi', 'Teslim noktası kaldırıldı',
    'Afet oluşturuldu', 'Afet durumu güncellendi', 'Operasyon açıldı', 'Afet kaydı güncellendi',
    'Topluluk afeti oluşturuldu', 'Topluluk afeti doğrulandı',
    'Kurum eklendi', 'Kurum doğrulandı',
    'Afet bildirimi gönderildi', 'Afet bildirimi birleştirildi', 'Afet bildirimi doğrulandı',
    -- 0036
    'Operasyon aşaması güncellendi'
  ]);
$$;

-- ---------- 7) Görünüm -------------------------------------------------------
-- `create or replace view` sütun listesini ortadan genişletemez; yeni sütunlar SONA
-- ekleniyor (0035'in dersi). Mevcut sütunların adı, sırası ve anlamı değişmedi.
--
-- Karşılama oranı için YENİ SÜTUN EKLENMEDİ: `completed_needs` ve `active_needs`
-- zaten burada ve oran ikisinin toplamına bölünerek çıkar. Aynı gerçeği üçüncü bir
-- sütunda saklamak, iki sayının ayrışabileceği bir yer daha açmak olurdu. MİKTAR
-- bazlı tek bir yüzde bilinçli olarak üretilmiyor: `required_total` farklı birimleri
-- (adet + litre + kilogram) topluyor ve tek bir yüzdeye çevrilirse yanıltır.
create or replace view disaster_overview as
select
  d.id, d.slug, d.name, d.region, d.province, d.type, d.status,
  d.opened_at, d.updated_at, d.volunteers, d.on_shift, d.is_demo,
  (select count(*) from needs n
     where n.disaster_id = d.id and n.remaining_qty > 0)                        as active_needs,
  (select count(*) from needs n
     where n.disaster_id = d.id and n.remaining_qty = 0)                        as completed_needs,
  (select count(*) from submissions s
     where s.disaster_id = d.id and s.status = 'Pending verification')          as pending_submissions,
  (select coalesce(sum(s.qty), 0) from submissions s
     where s.disaster_id = d.id and s.status = 'Pending verification')          as pending_units,
  (select count(*) from submissions s
     where s.disaster_id = d.id
       and s.status in ('Verified','Partially verified'))                       as verified_submissions,
  (select count(*) from locations l where l.disaster_id = d.id)                 as delivery_points,
  d.situation,
  d.legacy_slugs,
  d.opened_by_org_id,
  d.opened_by_community,
  d.community_confirmed_at,
  d.districts,
  d.settlements,
  (select coalesce(sum(n.required_qty), 0) from needs n
     where n.disaster_id = d.id)                                                as required_total,
  (select coalesce(sum(n.verified_qty), 0) from needs n
     where n.disaster_id = d.id)                                                as verified_total,
  (select coalesce(sum(n.remaining_qty), 0) from needs n
     where n.disaster_id = d.id)                                                as remaining_total,
  -- ---- 0036 ---------------------------------------------------------------
  d.operation_stage,
  d.operation_stage_note,
  d.operation_stage_set_at
from disasters d;

grant select on disaster_overview to anon, authenticated;

comment on view disaster_overview is
  'Public projection of an operation. Amount columns follow rules/02: remaining = max(required - verified, 0), and pending_units is never subtracted from remaining. operation_stage NULL = not stated.';

-- Şema değişti: PostgREST önbelleği tazelenmezse yeni alanlar API yanıtında görünmez.
notify pgrst, 'reload schema';
