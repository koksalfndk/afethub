-- 0048 — Saha güncellemeleri: public-safe Realtime projeksiyonu (Faz 4-A)
--
-- NEDEN AYRI BİR TABLO
-- --------------------
-- Faz 4-A güvenlik spike'ında ölçüldü (belge: claude/faz4a-realtime-guvenlik-spike):
--
--   * `realtime.apply_rls()` RLS'i ve SÜTUN BAZLI GRANT'i gerçekten uyguluyor.
--     Moderasyon bekleyen satır anon aboneye gitmiyor; izin verilmemiş sütun
--     payload'a hiç girmiyor.
--   * Ama `operation_updates` bugün publication'a eklense HİÇBİR event gitmezdi:
--     tabloda anon için SELECT politikası yok. İşe yaraması için anon'a bir RLS
--     politikası açmak gerekirdi — yüzey büyür.
--   * Üstelik payload'ın `columns` alanı, anon'un sütun izni olan 18 sütunun adını
--     ve tipini listeliyor. Şema ayrıntısı gereksiz yere yayınlanır.
--
-- Karar: base tablo publication'a HİÇ girmiyor. Realtime yalnızca aşağıdaki küçük
-- olay tablosunu görüyor ve o tablo **içerik gövdesi taşımıyor**. Olay bir
-- doğruluk kaynağı değil, bir uyarı: istemci olayı alınca kaydı
-- `operation_updates_public` üzerinden yeniden okuyor. Böylece "gizlenmiş bir
-- kaydın metni son bir kez event olarak gitti" senaryosu imkânsız.

-- ---------------------------------------------------------------------------
-- 1) Olay tablosu
-- ---------------------------------------------------------------------------
create table if not exists operation_update_events_public (
  id          bigint generated always as identity primary key,
  update_id   uuid        not null references operation_updates(id) on delete cascade,
  disaster_id uuid        not null references disasters(id) on delete cascade,
  event_type  text        not null,
  update_type text,
  is_pinned   boolean     not null default false,
  occurred_at timestamptz not null default now()
);

do $$ begin
  alter table operation_update_events_public
    add constraint operation_update_events_type_chk
    check (event_type in ('published','updated','hidden','corrected','pinned','unpinned'));
exception when duplicate_object then null; end $$;

-- Akış için tek indeks yeter: bir operasyonun son olayları.
create index if not exists operation_update_events_disaster_idx
  on operation_update_events_public (disaster_id, id desc);
-- Tek bir kaydın olay geçmişi (yeniden bağlanan istemci ve health kontrolü).
create index if not exists operation_update_events_update_idx
  on operation_update_events_public (update_id, id desc);

-- Bu tablo GÖVDE, BAŞLIK, KONUM, YAZAR, İLETİŞİM, MODERASYON GEREKÇESİ ve
-- DEPOLAMA YOLU taşımaz. Sütun listesi bilerek kısa: bir gün buraya `body`
-- eklenirse yukarıdaki bütün gerekçe çöker.

alter table operation_update_events_public enable row level security;

-- Her satır zaten public-safe olduğu için politika basit. Yazma politikası
-- BİLEREK YOK: politikası olmayan komut RLS tarafından reddedilir.
drop policy if exists operation_update_events_public_read on operation_update_events_public;
create policy operation_update_events_public_read on operation_update_events_public
  for select using (true);

revoke all on operation_update_events_public from public, anon, authenticated;
grant select on operation_update_events_public to anon, authenticated;
-- Sequence de kapalı: `grant select` bir identity sütununu ilerletmeye yetmez ama
-- ileride yanlışlıkla insert izni verilirse sequence engel olsun.
revoke all on all sequences in schema public from anon, authenticated;
grant usage on all sequences in schema public to postgres;

-- ---------------------------------------------------------------------------
-- 2) Olay üretici
-- ---------------------------------------------------------------------------
-- Tetikleyici fonksiyonu istemciden çağrılamaz: 0043 tetikleyici fonksiyonlarını
-- REST yüzeyinden çıkarmıştı, aynı kural burada da uygulanıyor.
create or replace function emit_operation_update_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_event text;
begin
  -- TEK OLAY KURALI. Bir işlemde birden çok şey değişebilir (yayınlarken aynı
  -- anda sabitlemek gibi); istemci her olayda kaydı zaten yeniden okuduğu için
  -- ikinci bir olay yeni bilgi taşımaz, yalnızca gürültü üretir. Öncelik sırası:
  --   yayın > gizleme > düzeltme > sabitleme > diğer değişiklik
  if tg_op = 'INSERT' then
    -- Moderasyon bekleyen kayıt olay ÜRETMEZ. Koordinatörün doğrudan yayımladığı
    -- güncelleme `published` olarak doğar ve olayı hak eder.
    if new.status <> 'published' then
      return null;
    -- Düzeltme (`correct_operation_update`) YENİ bir kayıt açıp eskisini kapatıyor.
    -- Yeni kaydın olayı `corrected`: istemci onu düzeltme etiketiyle gösterecek.
    -- Eski kayıt ayrıca `hidden` olayı alıyor ve listeden düşüyor.
    elsif new.corrects_update_id is not null then
      v_event := 'corrected';
    else
      v_event := 'published';
    end if;

  else
    if new.status = 'published' and old.status is distinct from 'published' then
      v_event := 'published';
    elsif old.status = 'published' and new.status is distinct from 'published' then
      -- Gizleme, reddetme, arşivleme ve moderasyona geri alma: istemci için hepsi
      -- aynı şey — kayıt herkese açık akıştan çıkıyor.
      v_event := 'hidden';
    elsif new.status <> 'published' then
      -- Yayımlanmamış kayıtta olan hiçbir şey herkese açık akışı ilgilendirmiyor.
      return null;
    elsif new.body is distinct from old.body
       or new.corrects_update_id is distinct from old.corrects_update_id then
      v_event := 'corrected';
    elsif new.is_pinned and not old.is_pinned then
      v_event := 'pinned';
    elsif old.is_pinned and not new.is_pinned then
      v_event := 'unpinned';
    elsif new.update_type          is distinct from old.update_type
       or new.verification_status  is distinct from old.verification_status
       or new.author_label         is distinct from old.author_label
       or new.author_type          is distinct from old.author_type
       or new.organization_id      is distinct from old.organization_id
       or new.related_need_id      is distinct from old.related_need_id
       or new.related_delivery_location_id is distinct from old.related_delivery_location_id
       or new.approximate_location is distinct from old.approximate_location
       or new.pinned_until         is distinct from old.pinned_until
       or new.published_at         is distinct from old.published_at then
      v_event := 'updated';
    else
      -- Yalnızca iç alanlar değişti (moderasyon gerekçesi, `updated_at`,
      -- `moderated_by`). Herkese açık hiçbir şey değişmedi; olay yok.
      return null;
    end if;
  end if;

  insert into operation_update_events_public (update_id, disaster_id, event_type, update_type, is_pinned)
  values (new.id, new.disaster_id, v_event, new.update_type::text,
          new.is_pinned and (new.pinned_until is null or new.pinned_until > now()));
  return null;
end $$;
revoke all on function emit_operation_update_event() from public, anon, authenticated;

drop trigger if exists operation_updates_emit_event on operation_updates;
create trigger operation_updates_emit_event
  after insert or update on operation_updates
  for each row execute function emit_operation_update_event();

-- ---------------------------------------------------------------------------
-- 3) Publication — YALNIZCA olay tablosu
-- ---------------------------------------------------------------------------
-- `add table` aynı tablo için ikinci kez çağrılırsa hata veriyor; migration
-- tekrar çalıştırılabilir olmalı.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'operation_update_events_public'
  ) then
    alter publication supabase_realtime add table operation_update_events_public;
  end if;
end $$;

-- Base tablolar publication'a GİRMEMELİ. Bir gün yanlışlıkla eklenirse migration
-- tekrar çalıştırıldığında geri alınsın.
do $$
declare t text;
begin
  foreach t in array array['operation_updates','operation_update_contacts',
                           'operation_update_attachments','operation_update_reports']
  loop
    if exists (select 1 from pg_publication_tables
                where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

-- `replica identity default`: olay tablosunda UPDATE ve DELETE yok, dolayısıyla
-- `full` gereksiz yere WAL büyütürdü.
alter table operation_update_events_public replica identity default;

-- ---------------------------------------------------------------------------
-- 4) Aktif sabitleme tanımı ve limiti
-- ---------------------------------------------------------------------------
-- 0038'deki sayım `pinned_until` alanını GÖRMÜYORDU: süresi çoktan geçmiş üç
-- sabitleme, dördüncüyü engelliyordu. Aktif sabitlemenin tanımı tek yerde olsun.
create or replace function operation_update_pin_is_active(p_is_pinned boolean, p_until timestamptz)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(p_is_pinned, false) and (p_until is null or p_until > now());
$$;
revoke all on function operation_update_pin_is_active(boolean, timestamptz) from public;
grant execute on function operation_update_pin_is_active(boolean, timestamptz) to anon, authenticated;

create or replace function pin_operation_update(
  p_update uuid, p_pinned boolean, p_until timestamptz default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  u          operation_updates;
  actor_name text;
  v_active   integer;
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can pin updates';
  end if;
  select * into u from operation_updates where id = p_update for update;
  if not found then raise exception 'Update not found'; end if;
  if p_pinned and u.status <> 'published' then
    raise exception 'Only a published update can be pinned';
  end if;
  if p_pinned and p_until is not null and p_until <= now() then
    raise exception 'The pin expiry must be in the future';
  end if;

  if p_pinned then
    select count(*) into v_active
      from operation_updates o
     where o.disaster_id = u.disaster_id
       and o.id <> u.id
       and o.status = 'published'
       and operation_update_pin_is_active(o.is_pinned, o.pinned_until);
    if v_active >= 3 then
      -- Mesaj Türkçe ve sayıyı söylüyor: koordinatör hangi sınıra çarptığını
      -- tahmin etmek zorunda kalmamalı.
      raise exception 'Bu operasyonda en fazla 3 güncelleme sabitlenebilir.';
    end if;
  end if;

  -- Aynı durumu tekrar yazmak yeni bir olay değil (rules/03 §Idempotency).
  if operation_update_pin_is_active(u.is_pinned, u.pinned_until) = coalesce(p_pinned, false)
     and u.pinned_until is not distinct from (case when p_pinned then p_until else null end) then
    return;
  end if;

  update operation_updates
     set is_pinned = p_pinned,
         pinned_until = case when p_pinned then p_until else null end,
         updated_at = now()
   where id = u.id;

  select coalesce(full_name, 'Koordinatör') into actor_name from profiles where id = auth.uid();
  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (u.disaster_id, actor_name,
          case when p_pinned then 'Saha güncellemesi sabitlendi'
               else 'Saha güncellemesi sabitlemesi kaldırıldı' end,
          left(u.body, 120), u.is_pinned::text, p_pinned::text, '#2A6FB0');
end $$;
revoke all on function pin_operation_update(uuid, boolean, timestamptz) from public, anon;
grant execute on function pin_operation_update(uuid, boolean, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Süresi geçen sabitlemeler — zamanlayıcı
-- ---------------------------------------------------------------------------
-- Faz 3-D'deki `expire_stale_pledges` kalıbının aynısı: ortak gövde yok çünkü tek
-- çağıran var, ama yetki kararı yine çağrı noktasında ve aktör `Sistem`.
create or replace function expire_operation_update_pins_system() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  r       record;
begin
  for r in
    select id, disaster_id, body
      from operation_updates
     where is_pinned = true
       and pinned_until is not null
       and pinned_until <= now()
     order by pinned_until
       for update skip locked
  loop
    -- Tetikleyici `unpinned` olayını kendisi üretiyor; burada ikinci kez
    -- yazılmıyor.
    update operation_updates set is_pinned = false, updated_at = now() where id = r.id;

    insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
    values (r.disaster_id, 'Sistem', 'Saha güncellemesi sabitlemesi kaldırıldı',
            left(r.body, 120), 'true', 'false', '#8A94A6');

    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function expire_operation_update_pins_system() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'expire-operation-update-pins') then
    perform cron.unschedule('expire-operation-update-pins');
  end if;
end $$;
select cron.schedule('expire-operation-update-pins', '23 * * * *',
                     $job$select public.expire_operation_update_pins_system()$job$);

-- ---------------------------------------------------------------------------
-- 6) Herkese açık listeleme — cursor
-- ---------------------------------------------------------------------------
-- Offset DEĞİL cursor: afet anında akışa sürekli yeni kayıt giriyor ve offset
-- sayfalaması aynı kaydı iki kez ya da hiç göstermez.
--
-- Aktif sabitlenmiş kayıtlar bu listede YOK: onları `list_pinned_operation_updates`
-- veriyor ve arayüz ayrı bir bölümde gösteriyor. Aynı kartın iki kez görünmesi,
-- "iki ayrı uyarı var" diye okunur. Sabitleme süresi dolduğunda kayıt bu listede
-- kendi kronolojik yerine geri döner — ek bir iş gerekmiyor.
create or replace function list_operation_updates_public(
  p_disaster             uuid,
  p_type                 text        default null,
  p_before_published_at  timestamptz default null,
  p_before_id            uuid        default null,
  p_limit                integer     default 20
) returns table (
  id uuid, disaster_id uuid, update_type text, verification_status text,
  author_type text, author_label text, organization_id uuid, body text,
  related_need_id uuid, related_need_name text,
  related_delivery_location_id uuid, related_location_name text,
  approximate_location text, is_pinned boolean, pinned_until timestamptz,
  corrects_update_id uuid, published_at timestamptz, created_at timestamptz,
  photo_count bigint
)
language sql stable security definer set search_path = public as $$
  select v.id, v.disaster_id, v.update_type::text, v.verification_status,
         v.author_type, v.author_label, v.organization_id, v.body,
         v.related_need_id, v.related_need_name,
         v.related_delivery_location_id, v.related_location_name,
         v.approximate_location, v.is_pinned, v.pinned_until,
         v.corrects_update_id, v.published_at, v.created_at, v.photo_count
    from operation_updates_public v
   where v.disaster_id = p_disaster
     and (p_type is null or v.update_type::text = p_type)
     and not v.is_pinned
     and (
       p_before_published_at is null
       or (coalesce(v.published_at, v.created_at), v.id)
          < (p_before_published_at, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid))
     )
   order by coalesce(v.published_at, v.created_at) desc, v.id desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke all on function list_operation_updates_public(uuid, text, timestamptz, uuid, integer) from public;
grant execute on function list_operation_updates_public(uuid, text, timestamptz, uuid, integer) to anon, authenticated;

create or replace function list_pinned_operation_updates(p_disaster uuid)
returns setof operation_updates_public
language sql stable security definer set search_path = public as $$
  select * from operation_updates_public
   where disaster_id = p_disaster and is_pinned
   order by coalesce(published_at, created_at) desc
   limit 3;
$$;
revoke all on function list_pinned_operation_updates(uuid) from public;
grant execute on function list_pinned_operation_updates(uuid) to anon, authenticated;

-- Tek kaydı yeniden okumak için: Realtime olayı geldiğinde istemcinin çağırdığı
-- yol. Olayın kendisi hiçbir zaman render edilmiyor.
create or replace function get_operation_update_public(p_update uuid)
returns setof operation_updates_public
language sql stable security definer set search_path = public as $$
  select * from operation_updates_public where id = p_update;
$$;
revoke all on function get_operation_update_public(uuid) from public;
grant execute on function get_operation_update_public(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) İndeksler
-- ---------------------------------------------------------------------------
create index if not exists operation_updates_feed_idx
  on operation_updates (disaster_id, status, published_at desc);
create index if not exists operation_updates_queue_idx
  on operation_updates (status, created_at desc);

notify pgrst, 'reload schema';
