-- AfetHUB — migration 0037
-- Teslim sözü (delivery pledge): "bunu getireceğim" ile "bunu getirdim" ayrımı.
--
-- Bugün kartta tek bir aksiyon var — `Bunu teslim ettim` — ve yola çıkmayı planlayan
-- kişi ya yalan söylemek ya da vazgeçmek zorunda kalıyor. İkisi FARKLI olaylar:
--
--   Teslim sözü  → bir niyet.  Hiçbir miktarı değiştirmez.
--   Teslimat     → bir iddia.  `submissions` tablosu, bekleyen miktara girer.
--   Doğrulama    → bir karar.  Yalnızca bu `verified_qty`'yi artırır.
--
-- KANONİK KURAL DEĞİŞMEDİ (CLAUDE.md §Core Quantity Rule, rules/02):
--     remaining_qty = max(required_qty - verified_qty, 0)
-- Bu dosya `needs.verified_qty`, `needs.pending_qty` ve `needs.remaining_qty` üzerinde
-- HİÇBİR yazma yapmaz; tek bir tetikleyici bile eklemez. Teslim sözü ayrı bir tabloda
-- durur ve herkese açık ekranda ayrı bir cümleyle ("yolda / planlanan") yazılır.
--
-- Kayıt PII taşıdığı için tablo herkese açık okunmaz; ziyaretçiye açık olan iki şey:
--   1) `need_pledge_totals` — kişiye bağlanamayan toplam
--   2) `track_delivery_pledge(kod, e-posta)` — kişinin KENDİ kaydı
-- (rules/01 §Public Access, rules/03 §Contact Information)
-- =============================================================================

-- ---------- 1) Durumlar ------------------------------------------------------
-- 'delivered_reported' bir teslimat DEĞİL: kişi getirdiğini söyledi, `submissions`
-- kaydı açıldı ve doğrulama sırasına girdi. Sözün kendisi orada biter.
do $$ begin
  create type pledge_status as enum (
    'pledged',            -- Teslim sözü verildi
    'confirmed',          -- Koordinatör sözü not aldı
    'in_transit',         -- Yola çıktı
    'delivered_reported', -- Teslimat bildirildi (doğrulama sırasında)
    'fulfilled',          -- Bildirimi koordinatör doğruladı
    'cancelled',          -- Kişi vazgeçti
    'expired'             -- Tarihi geçti, haber yok
  );
exception when duplicate_object then null; end $$;

-- ---------- 2) Tablo ---------------------------------------------------------
create table if not exists delivery_pledges (
  id                    uuid primary key default gen_random_uuid(),
  -- Okunması kolay, tahmin edilmesi zor. Tek başına erişim vermez: `track_delivery_pledge`
  -- ayrıca e-posta eşleşmesi ister (rules/02 §Tracking Codes).
  public_tracking_code  text not null unique,
  disaster_id           uuid not null references disasters(id) on delete cascade,
  need_id               uuid not null references needs(id) on delete cascade,
  delivery_location_id  uuid references locations(id) on delete set null,
  -- Hesabı olan kişi için bağlantı; misafir için NULL. Hesap ZORUNLU DEĞİL
  -- (CLAUDE.md §Primary Product Rule).
  registered_user_id    uuid references auth.users(id) on delete set null,
  contact_name          text not null,
  contact_email         text not null,
  contact_phone         text not null default '',
  contact_city          text not null default '',
  -- `submissions.qty` ile aynı tip: iki sayı ekranda yan yana yazılacak ve biri
  -- ondalık diğeri tam sayı olursa toplamları karşılaştırmak anlamsızlaşır.
  qty                   integer not null check (qty >= 1),
  unit                  text not null default 'adet',
  estimated_delivery_at timestamptz,
  status                pledge_status not null default 'pledged',
  notes                 text not null default '',
  -- Söz gerçek bir teslimat bildirimine dönüştüğünde kurulan bağ. Söz kaydı SİLİNMEZ:
  -- kaç sözün gerçekten teslimata döndüğü ölçülebilir kalmalı (rules/05 §Soft Deletion).
  submission_id         uuid references submissions(id) on delete set null,
  cancelled_at          timestamptz,
  cancel_reason         text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

do $$ begin
  alter table delivery_pledges
    add constraint delivery_pledges_notes_len check (length(notes) <= 500);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table delivery_pledges
    add constraint delivery_pledges_name_len check (length(contact_name) between 2 and 120);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table delivery_pledges
    add constraint delivery_pledges_email_shape check (contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$');
exception when duplicate_object then null; end $$;

create index if not exists delivery_pledges_need_idx     on delivery_pledges (need_id, status);
create index if not exists delivery_pledges_disaster_idx on delivery_pledges (disaster_id, status);
create index if not exists delivery_pledges_email_idx    on delivery_pledges (lower(contact_email));
create index if not exists delivery_pledges_due_idx      on delivery_pledges (estimated_delivery_at)
  where status in ('pledged', 'confirmed', 'in_transit');

comment on table delivery_pledges is
  'Intent to deliver. NEVER affects needs.verified_qty / pending_qty / remaining_qty.';

-- ---------- 3) RLS -----------------------------------------------------------
-- Tabloya doğrudan INSERT politikası YOK: tek yazma yolu aşağıdaki SECURITY DEFINER
-- fonksiyonu. Böylece miktar aralığı, ihtiyacın açık olup olmadığı ve tekrar gönderim
-- kontrolü atlanamıyor (rules/03 §Input Validation).
alter table delivery_pledges enable row level security;

drop policy if exists delivery_pledges_coord_read on delivery_pledges;
create policy delivery_pledges_coord_read on delivery_pledges
  for select using (is_coordinator());

-- Hesabı olan kişi kendi sözlerini görebilir. Misafir göremez: eşleşecek tek şey
-- yazılan bir adres olurdu ve bu bir ifşa uç noktası demektir (aynı gerekçe
-- `my_volunteer_applications` içinde de yazılı).
drop policy if exists delivery_pledges_own_read on delivery_pledges;
create policy delivery_pledges_own_read on delivery_pledges
  for select using (registered_user_id is not null and registered_user_id = auth.uid());

-- Supabase yeni tablolara `anon` ve `authenticated` için varsayılan SELECT yetkisi
-- verir; RLS onu sıfır satıra indirirdi ama tablo yine de SORGULANABİLİR olurdu.
-- `anon`ın burada işi yok: yetki tamamen kaldırılıyor, böylece istek RLS'e bile
-- ulaşmadan reddediliyor. `authenticated` kalıyor — `delivery_pledges_own_read`
-- politikası kişinin kendi kaydını görebilmesi için tablo yetkisine ihtiyaç duyuyor.
revoke all on delivery_pledges from anon;

-- ---------- 4) Herkese açık toplam ------------------------------------------
-- Kişiye bağlanamayan tek sayı. Yalnızca CANLI niyetler sayılır:
--   * 'delivered_reported' ve 'fulfilled' YOK — o miktar artık `submissions` üzerinden
--     "doğrulama bekliyor" ya da "doğrulandı" olarak zaten yazılıyor; ikisini birden
--     saymak aynı kutuyu iki kere göstermek olurdu.
--   * 'cancelled' ve 'expired' YOK — gelmeyecek.
--
-- Birim ihtiyacın birimi; farklı birimler toplanmıyor çünkü bir söz her zaman TEK bir
-- ihtiyaca bağlı ve o ihtiyacın birimini taşıyor.
create or replace view need_pledge_totals as
select
  p.need_id,
  p.disaster_id,
  max(p.unit)             as unit,
  sum(p.qty)::bigint      as pledged_qty,
  count(*)::bigint        as pledge_count
from delivery_pledges p
where p.status in ('pledged', 'confirmed', 'in_transit')
group by p.need_id, p.disaster_id;

comment on view need_pledge_totals is
  'Public, non-identifying total of live delivery pledges per need. Informational only: it never reduces remaining_qty.';

grant select on need_pledge_totals to anon, authenticated;

-- ---------- 5) Takip kodu ----------------------------------------------------
-- Karışabilen harf ve rakamlar (0/O, 1/I/L) alfabede yok: kod telefonda okunacak.
create or replace function gen_pledge_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  i integer;
begin
  for attempt in 1..12 loop
    candidate := 'SOZ-';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    if not exists (select 1 from delivery_pledges where public_tracking_code = candidate) then
      return candidate;
    end if;
  end loop;
  raise exception 'Could not allocate a tracking code';
end $$;
revoke all on function gen_pledge_code() from public, anon, authenticated;

-- ---------- 6) Söz oluşturma -------------------------------------------------
create or replace function create_delivery_pledge(
  p_need        uuid,
  p_qty         integer,
  p_unit        text default null,
  p_location    uuid default null,
  p_eta         timestamptz default null,
  p_name        text default '',
  p_email       text default '',
  p_phone       text default '',
  p_city        text default '',
  p_notes       text default ''
) returns text
language plpgsql security definer set search_path = public as $$
declare
  n        needs;
  d        disasters;
  v_code   text;
  v_exist  delivery_pledges;
begin
  if p_qty is null or p_qty < 1 or p_qty > 1000000 then
    raise exception 'Quantity must be between 1 and 1000000';
  end if;
  if btrim(coalesce(p_name, '')) = '' or btrim(coalesce(p_email, '')) = '' then
    raise exception 'Name and e-mail are required';
  end if;
  if length(coalesce(p_notes, '')) > 500 then
    raise exception 'Note is too long';
  end if;
  -- Geçmişe söz verilemez, ve tarihsiz bir söz hatırlatılamaz. 90 gün üstü bir tarih
  -- bir afet operasyonunda plan değil, veri hatasıdır.
  if p_eta is not null and (p_eta < now() - interval '1 hour' or p_eta > now() + interval '90 days') then
    raise exception 'Estimated delivery time is out of range';
  end if;

  select * into n from needs where id = p_need;
  if not found then raise exception 'Need not found'; end if;
  select * into d from disasters where id = n.disaster_id;
  if d.status <> 'Active' then
    raise exception 'This operation is not accepting aid';
  end if;
  -- rules/02 §Completion: kapalı ya da duraklatılmış bir kalem yeni yardım kabul etmez.
  if n.priority in ('Completed', 'Paused') then
    raise exception 'This need is not accepting aid';
  end if;
  if p_location is not null and not exists (
    select 1 from locations l where l.id = p_location and l.disaster_id = n.disaster_id
  ) then
    raise exception 'Delivery point does not belong to this operation';
  end if;

  -- Ağ tekrarı ikinci bir söz üretmemeli (rules/03 §Idempotency). Aynı adres, aynı
  -- kalem, aynı miktar ve 10 dakika içinde: aynı kaydın kodu geri döner.
  select * into v_exist
    from delivery_pledges
   where need_id = p_need
     and lower(contact_email) = lower(btrim(p_email))
     and qty = p_qty
     and status = 'pledged'
     and created_at > now() - interval '10 minutes'
   order by created_at desc
   limit 1;
  if found then
    return v_exist.public_tracking_code;
  end if;

  -- Kaba kullanım freni: aynı adresten aynı operasyona saatte 10 söz.
  if (select count(*) from delivery_pledges
       where disaster_id = n.disaster_id
         and lower(contact_email) = lower(btrim(p_email))
         and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many pledges from this address, please try again later';
  end if;

  v_code := gen_pledge_code();

  insert into delivery_pledges (
    public_tracking_code, disaster_id, need_id, delivery_location_id, registered_user_id,
    contact_name, contact_email, contact_phone, contact_city,
    qty, unit, estimated_delivery_at, status, notes
  ) values (
    v_code, n.disaster_id, n.id, p_location, auth.uid(),
    btrim(p_name), lower(btrim(p_email)), btrim(coalesce(p_phone, '')), btrim(coalesce(p_city, '')),
    p_qty, coalesce(nullif(btrim(coalesce(p_unit, '')), ''), n.unit), p_eta, 'pledged',
    btrim(coalesce(p_notes, ''))
  );

  -- Denetim kaydı KİŞİSEL VERİ TAŞIMAZ: ad, e-posta ve telefon satıra girmez.
  -- Aksiyon adı `audit_is_public()` izin listesinde YOK; yalnızca yönetici okur.
  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (
    n.disaster_id, case when auth.uid() is null then 'Misafir' else 'Kayıtlı kullanıcı' end,
    'Teslim sözü verildi',
    n.name || ' · ' || v_code, '—', p_qty || ' ' || coalesce(nullif(btrim(coalesce(p_unit, '')), ''), n.unit),
    '#2A6FB0'
  );

  return v_code;
end $$;

-- Hesap gerektirmez (CLAUDE.md §Primary Product Rule).
revoke all on function create_delivery_pledge(uuid, integer, text, uuid, timestamptz, text, text, text, text, text) from public;
grant execute on function create_delivery_pledge(uuid, integer, text, uuid, timestamptz, text, text, text, text, text) to anon, authenticated;

-- ---------- 7) Takip ---------------------------------------------------------
-- `track_submission` ile aynı desen: kod TEK BAŞINA yetmez, e-posta eşleşmeli.
create or replace function track_delivery_pledge(p_code text, p_email text)
returns table (
  code text, qty integer, unit text, need_name text, location_name text,
  estimated_delivery_at timestamptz, status pledge_status, notes text, created_at timestamptz
) language sql security definer set search_path = public as $$
  select p.public_tracking_code, p.qty, p.unit, n.name,
         coalesce(l.name, ''), p.estimated_delivery_at, p.status, p.notes, p.created_at
  from delivery_pledges p
  join needs n on n.id = p.need_id
  left join locations l on l.id = p.delivery_location_id
  where upper(p.public_tracking_code) = upper(btrim(p_code))
    and lower(p.contact_email) = lower(btrim(p_email));
$$;
grant execute on function track_delivery_pledge(text, text) to anon, authenticated;

-- ---------- 8) İptal ---------------------------------------------------------
-- Kullanıcı vazgeçebilmeli. Suçlayıcı bir dil yok ve hiçbir miktar etkilenmiyor —
-- zaten hiçbir zaman etkilenmemişti.
create or replace function cancel_delivery_pledge(
  p_code text, p_email text, p_reason text default ''
) returns pledge_status
language plpgsql security definer set search_path = public as $$
declare
  p delivery_pledges;
begin
  select * into p from delivery_pledges
   where upper(public_tracking_code) = upper(btrim(p_code))
     and lower(contact_email) = lower(btrim(p_email))
   for update;
  if not found then raise exception 'Pledge not found'; end if;

  if p.status in ('cancelled', 'expired') then
    return p.status;
  end if;
  -- Teslimat bildirildikten sonra söz iptal edilemez: artık ortada koordinatörün
  -- karar vereceği bir kayıt var ve onu geri almanın yolu iptal değil, doğrulama.
  if p.status in ('delivered_reported', 'fulfilled') then
    raise exception 'This pledge already became a delivery report';
  end if;

  update delivery_pledges
     set status = 'cancelled', cancelled_at = now(),
         cancel_reason = left(btrim(coalesce(p_reason, '')), 300), updated_at = now()
   where id = p.id;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (p.disaster_id, 'Misafir', 'Teslim sözü iptal edildi',
          p.public_tracking_code, p.status::text, 'cancelled', '#8A94A6');

  return 'cancelled'::pledge_status;
end $$;
grant execute on function cancel_delivery_pledge(text, text, text) to anon, authenticated;

-- ---------- 9) Koordinatör durumu -------------------------------------------
create or replace function set_pledge_status(
  p_pledge uuid, p_status pledge_status, p_reason text default ''
) returns void
language plpgsql security definer set search_path = public as $$
declare
  p          delivery_pledges;
  actor_name text;
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can change a pledge status';
  end if;
  -- 'fulfilled' bir koordinatör kararı değil, bir SONUÇ: bağlı teslimat bildirimi
  -- doğrulandığında yazılır. Elle işaretlenebilseydi doğrulanmamış bir teslimat
  -- "tamamlandı" görünürdü (rules/07 §Critical Distinctions).
  if p_status = 'fulfilled' then
    raise exception 'A pledge becomes fulfilled only when its delivery report is verified';
  end if;

  select * into p from delivery_pledges where id = p_pledge for update;
  if not found then raise exception 'Pledge not found'; end if;

  select coalesce(full_name, 'Koordinatör') into actor_name from profiles where id = auth.uid();

  update delivery_pledges
     set status = p_status,
         cancelled_at  = case when p_status = 'cancelled' then now() else cancelled_at end,
         cancel_reason = case when p_status = 'cancelled'
                              then left(btrim(coalesce(p_reason, '')), 300) else cancel_reason end,
         updated_at = now()
   where id = p.id;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (p.disaster_id, actor_name, 'Teslim sözü durumu güncellendi',
          p.public_tracking_code, p.status::text, p_status::text, '#2A6FB0');
end $$;
revoke all on function set_pledge_status(uuid, pledge_status, text) from public, anon;
grant execute on function set_pledge_status(uuid, pledge_status, text) to authenticated;

-- ---------- 10) Söz → teslimat bildirimi ------------------------------------
-- Bağ kuruluyor, miktar DEĞİŞMİYOR. `submissions` kaydını kim açtıysa bekleyen miktar
-- oradan yürür; burada yalnızca sözün defteri kapanır.
create or replace function link_pledge_to_submission(
  p_code text, p_email text, p_submission uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  p delivery_pledges;
  s submissions;
begin
  select * into p from delivery_pledges
   where upper(public_tracking_code) = upper(btrim(p_code))
     and lower(contact_email) = lower(btrim(p_email))
   for update;
  if not found then raise exception 'Pledge not found'; end if;
  if p.status in ('cancelled', 'expired', 'delivered_reported', 'fulfilled') then
    raise exception 'This pledge can no longer be linked to a delivery report';
  end if;

  select * into s from submissions where id = p_submission;
  if not found then raise exception 'Delivery report not found'; end if;
  if s.need_id <> p.need_id then
    raise exception 'The delivery report is for a different need';
  end if;

  update delivery_pledges
     set status = 'delivered_reported', submission_id = s.id, updated_at = now()
   where id = p.id;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (p.disaster_id, 'Misafir', 'Teslim sözü teslimata dönüştü',
          p.public_tracking_code || ' · ' || s.code, p.status::text, 'delivered_reported', '#2A6FB0');
end $$;
grant execute on function link_pledge_to_submission(text, text, uuid) to anon, authenticated;

-- ---------- 11) Süresi geçenler ---------------------------------------------
-- Otomatik değil, çağrılabilir: bu projede zamanlanmış iş altyapısı yok ve olmayan bir
-- zamanlayıcıyı varmış gibi göstermek raporu yalanlar. Panelden ya da bir cron
-- işinden çağrılır; 48 saat pay bırakılıyor çünkü afet bölgesinde bir gün gecikme
-- vazgeçmek demek değil.
create or replace function expire_stale_pledges(p_grace_hours integer default 48)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can expire pledges';
  end if;
  with moved as (
    update delivery_pledges
       set status = 'expired', updated_at = now()
     where status in ('pledged', 'confirmed')
       and estimated_delivery_at is not null
       and estimated_delivery_at < now() - make_interval(hours => greatest(1, p_grace_hours))
    returning id
  )
  select count(*) into v_count from moved;
  return v_count;
end $$;
revoke all on function expire_stale_pledges(integer) from public, anon;
grant execute on function expire_stale_pledges(integer) to authenticated;

notify pgrst, 'reload schema';
