-- 0044 — Teslim sözü operasyon katmanı (Faz 3-C)
--
-- Koordinatörün gün boyu açık tutacağı ekranın sunucu tarafı. Yeni bir teslim sözü
-- sistemi KURULMUYOR: mevcut tablo, mevcut durum kümesi ve mevcut denetim kaydı
-- aynen kullanılıyor. Eklenen şey okuma yüzeyi ve eksik olan iki güvenlik kuralı.
--
-- Değişmez alan kuralları bu migration'da hiçbir yerde esnetilmiyor:
--   · Hiçbir fonksiyon `needs` tablosuna dokunmuyor.
--   · `fulfilled` elle yazılamıyor.
--   · Bağlama (link) miktar değiştirmiyor.
--
-- Yetki modeli: her fonksiyon `security definer`, gövdesinde `is_coordinator()`
-- kontrolü var, ve EXECUTE izni PUBLIC'ten alınıp yalnızca `authenticated`e
-- veriliyor. (0043'te öğrenildi: PUBLIC'ten almayan bir revoke hiçbir şey yapmaz.)

-- ---------------------------------------------------------------------------
-- 1) Durum makinesi
-- ---------------------------------------------------------------------------
-- Şimdiye kadar `set_pledge_status()` yalnızca `fulfilled`i engelliyordu; geri kalan
-- her geçişe izin veriyordu. Yani iptal edilmiş bir söz "yolda" yapılabilirdi ve
-- kapanmış bir defter sessizce yeniden açılabilirdi.
--
-- Geçişler burada TEK yerde tanımlı. Arayüz de aynı listeyi gösteriyor ama karar
-- burada veriliyor — düğmeyi gizlemek yetkilendirme değildir (rules/03).
create or replace function pledge_transition_allowed(
  p_from pledge_status, p_to pledge_status
) returns boolean
language sql immutable set search_path = public as $$
  select (p_from, p_to) in (
    ('pledged',    'confirmed'),
    ('pledged',    'in_transit'),
    ('pledged',    'cancelled'),
    ('pledged',    'expired'),
    ('confirmed',  'in_transit'),
    ('confirmed',  'cancelled'),
    ('confirmed',  'expired'),
    ('in_transit', 'delivered_reported'),
    ('in_transit', 'cancelled'),
    ('in_transit', 'expired'),
    ('delivered_reported', 'fulfilled')
  );
$$;
revoke all on function pledge_transition_allowed(pledge_status, pledge_status) from public, anon;
grant execute on function pledge_transition_allowed(pledge_status, pledge_status) to authenticated;

-- `set_pledge_status` yeniden yazılıyor: imza aynı, davranış daha dar. Dönüş tipi
-- `void`den `pledge_status`e geçtiği için `create or replace` yetmiyor; önce
-- düşürmek gerekiyor. Bağımlı bir nesne yok (yalnızca istemci RPC ile çağırıyor).
drop function if exists set_pledge_status(uuid, pledge_status, text);
create or replace function set_pledge_status(
  p_pledge uuid, p_status pledge_status, p_reason text default ''
) returns pledge_status
language plpgsql security definer set search_path = public as $$
declare
  p          delivery_pledges;
  actor_name text;
  act        text;
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can change a pledge status';
  end if;
  -- 'fulfilled' bir koordinatör kararı değil, bir SONUÇ: bağlı teslimat bildirimi
  -- doğrulandığında yazılır (rules/07 §Critical Distinctions).
  if p_status = 'fulfilled' then
    raise exception 'A pledge becomes fulfilled only when its delivery report is verified';
  end if;

  select * into p from delivery_pledges where id = p_pledge for update;
  if not found then raise exception 'Pledge not found'; end if;

  -- Aynı durumu tekrar yazmak yeni bir olay değil: ağ yeniden denemesi ikinci bir
  -- denetim satırı üretmemeli (rules/03 §Idempotency).
  if p.status = p_status then
    return p.status;
  end if;

  if not pledge_transition_allowed(p.status, p_status) then
    raise exception 'Bu geçişe izin verilmiyor: % -> %', p.status, p_status;
  end if;

  select coalesce(full_name, 'Koordinatör') into actor_name from profiles where id = auth.uid();

  update delivery_pledges
     set status = p_status,
         cancelled_at  = case when p_status = 'cancelled' then now() else cancelled_at end,
         cancel_reason = case when p_status = 'cancelled'
                              then left(btrim(coalesce(p_reason, '')), 300) else cancel_reason end,
         updated_at = now()
   where id = p.id;

  -- Denetim kaydında eylem adı SONUCU söylüyor; tek bir "durum güncellendi" satırı
  -- kaydı okuyan kişiye ne olduğunu anlatmıyordu.
  act := case p_status
           when 'confirmed'          then 'Teslim sözü teyit edildi'
           when 'in_transit'         then 'Teslim sözü yolda olarak işaretlendi'
           when 'delivered_reported' then 'Teslim sözü teslim bildirildi olarak işaretlendi'
           when 'cancelled'          then 'Teslim sözü iptal edildi'
           when 'expired'            then 'Teslim sözünün süresi doldu'
           else 'Teslim sözü durumu güncellendi'
         end;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (p.disaster_id, actor_name, act,
          p.public_tracking_code, p.status::text, p_status::text, '#2A6FB0');

  return p_status;
end $$;
revoke all on function set_pledge_status(uuid, pledge_status, text) from public, anon;
grant execute on function set_pledge_status(uuid, pledge_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Bir teslimat bildirimi EN FAZLA bir söze bağlanabilir
-- ---------------------------------------------------------------------------
-- Uygulama katmanında kontrol etmek yarış koşuluna açıktı: iki koordinatör aynı
-- bildirimi iki ayrı söze bağlayabilirdi. Kısıt veritabanında.
create unique index if not exists delivery_pledges_submission_uidx
  on delivery_pledges (submission_id) where submission_id is not null;

-- ---------------------------------------------------------------------------
-- 3) Maskeleme
-- ---------------------------------------------------------------------------
-- Liste sorgusu tam iletişim verisini HİÇ getirmiyor; maskeleme veritabanında
-- yapılıyor ki maskesiz hâli ağa hiç çıkmasın (rules/03 §Contact Information).
create or replace function mask_email(p text) returns text
language sql immutable set search_path = public as $$
  select case
    when coalesce(btrim(p),'') = '' then ''
    when position('@' in p) = 0 then left(p,1) || '***'
    else left(split_part(p,'@',1), 1) || '***@' || split_part(p,'@',2)
  end;
$$;

create or replace function mask_phone(p text) returns text
language sql immutable set search_path = public as $$
  -- Yalnızca SON DÖRT hane açık: doğru kişiyle konuşulduğunu teyit etmeye yeter,
  -- numarayı yeniden kurmaya yetmez.
  select case
    when length(regexp_replace(coalesce(p,''), '\D', '', 'g')) < 4 then ''
    else '••• ••• ' || right(regexp_replace(p, '\D', '', 'g'), 4)
  end;
$$;

create or replace function mask_person(p text) returns text
language sql immutable set search_path = public as $$
  select coalesce(
    nullif(btrim(array_to_string(array(
      select left(w, 1) || '***' from unnest(string_to_array(btrim(p), ' ')) w where w <> ''
    ), ' ')), ''), '');
$$;

revoke all on function mask_email(text)  from public, anon;
revoke all on function mask_phone(text)  from public, anon;
revoke all on function mask_person(text) from public, anon;
grant execute on function mask_email(text)  to authenticated;
grant execute on function mask_phone(text)  to authenticated;
grant execute on function mask_person(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Liste
-- ---------------------------------------------------------------------------
-- Gecikme SUNUCUDA hesaplanıyor. İstemcinin saati yanlış olabilir ve "3 saat
-- gecikti" cümlesi koordinatörün telefon açmasına sebep olan bir cümle — yanlış
-- saatle üretilmemeli (direktif §11).
--
-- Sayfalama offset tabanlı: proje genelinde kullanılan kalıp bu ve tutarlılık,
-- bu boyuttaki bir veri kümesi için cursor'ın teorik üstünlüğünden daha değerli
-- (rules/06 §Avoid creating duplicate systems). Toplam sayı da dönüyor ki arayüz
-- "25 / 108" diyebilsin.
create or replace function list_delivery_pledges_for_coordinator(
  p_disaster   uuid    default null,
  p_need       uuid    default null,
  p_status     text[]  default null,   -- null = hepsi
  p_view       text    default 'all',  -- all|today|upcoming|overdue|reported|cancelled|expired|done
  p_overdue    boolean default null,
  p_location   uuid    default null,
  p_city       text    default null,
  p_search     text    default null,
  p_from       date    default null,
  p_to         date    default null,
  p_sort       text    default 'operational',
  p_limit      integer default 25,
  p_offset     integer default 0
) returns table (
  id              uuid,
  code            text,
  disaster_id     uuid,
  disaster_name   text,
  need_id         uuid,
  need_name       text,
  need_priority   text,
  qty             integer,
  unit            text,
  location_name   text,
  estimated_at    timestamptz,
  status          pledge_status,
  overdue_minutes integer,
  contact_masked  text,
  email_masked    text,
  phone_masked    text,
  city            text,
  has_phone       boolean,
  submission_id   uuid,
  submission_code text,
  created_at      timestamptz,
  updated_at      timestamptz,
  total_count     bigint
)
language plpgsql security definer set search_path = public as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  tz      text    := 'Europe/Istanbul';
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can list delivery pledges';
  end if;

  return query
  with base as (
    select p.*,
           n.name as n_name, n.priority as n_priority,
           d.name as d_name,
           l.name as l_name,
           s.code as s_code,
           -- Canlı bir sözün tahmini zamanı geçtiyse gecikme; kapanmış durumlar
           -- (bildirildi/tamamlandı/iptal/süresi doldu) HİÇBİR ZAMAN gecikmiş sayılmaz.
           case
             when p.status in ('pledged','confirmed','in_transit')
              and p.estimated_delivery_at is not null
              and p.estimated_delivery_at < now()
             then greatest(0, (extract(epoch from (now() - p.estimated_delivery_at)) / 60)::integer)
             else null
           end as overdue_min
      from delivery_pledges p
      join needs      n on n.id = p.need_id
      join disasters  d on d.id = p.disaster_id
      left join locations   l on l.id = p.delivery_location_id
      left join submissions s on s.id = p.submission_id
  ),
  filtered as (
    select * from base b
     where (p_disaster is null or b.disaster_id = p_disaster)
       and (p_need     is null or b.need_id     = p_need)
       and (p_location is null or b.delivery_location_id = p_location)
       and (p_status   is null or b.status::text = any(p_status))
       and (p_city     is null or b.contact_city ilike '%' || btrim(p_city) || '%')
       and (p_overdue  is null or (p_overdue and b.overdue_min is not null)
                              or (not p_overdue and b.overdue_min is null))
       and (p_from is null or (b.estimated_delivery_at at time zone tz)::date >= p_from)
       and (p_to   is null or (b.estimated_delivery_at at time zone tz)::date <= p_to)
       -- Arama YALNIZCA takip kodu, ihtiyaç, teslim noktası ve şehirde. Ad, e-posta
       -- ve telefon BİLEREK dışarıda: buradan arama yapılabilseydi liste, tahmin
       -- edilen bir adresi doğrulamanın yolu olurdu (direktif §18).
       and (p_search is null or length(btrim(p_search)) < 3 or (
              b.public_tracking_code ilike '%' || btrim(p_search) || '%'
           or b.n_name               ilike '%' || btrim(p_search) || '%'
           or coalesce(b.l_name,'')  ilike '%' || btrim(p_search) || '%'
           or coalesce(b.contact_city,'') ilike '%' || btrim(p_search) || '%'
       ))
       and case coalesce(p_view, 'all')
             when 'today'    then b.status in ('pledged','confirmed','in_transit')
                                  and (b.estimated_delivery_at at time zone tz)::date = (now() at time zone tz)::date
             when 'upcoming' then b.status in ('pledged','confirmed','in_transit')
                                  and (b.estimated_delivery_at at time zone tz)::date
                                      between ((now() at time zone tz)::date + 1)
                                          and ((now() at time zone tz)::date + 7)
             when 'overdue'  then b.overdue_min is not null
             when 'transit'  then b.status = 'in_transit'
             when 'reported' then b.status = 'delivered_reported'
             when 'done'     then b.status = 'fulfilled'
             when 'cancelled'then b.status = 'cancelled'
             when 'expired'  then b.status = 'expired'
             else true
           end
  ),
  counted as (select count(*) as n from filtered)
  select f.id,
         f.public_tracking_code,
         f.disaster_id, f.d_name,
         f.need_id, f.n_name, f.n_priority::text,
         f.qty, f.unit,
         coalesce(f.l_name, ''),
         f.estimated_delivery_at,
         f.status,
         f.overdue_min,
         mask_person(f.contact_name),
         mask_email(f.contact_email),
         mask_phone(f.contact_phone),
         coalesce(f.contact_city, ''),
         length(regexp_replace(coalesce(f.contact_phone,''), '\D', '', 'g')) >= 7,
         f.submission_id, coalesce(f.s_code, ''),
         f.created_at, f.updated_at,
         (select n from counted)
    from filtered f
   order by
     -- Varsayılan sıra operasyonel: önce gecikenler (en çok gecikmiş başta), sonra
     -- bugün beklenenler, sonra en yakın teslim zamanı. Bir rapor ekranında tarih
     -- sırası yeterdi; burada koordinatörün önce bakması gereken satır en üstte.
     case when p_sort = 'operational' and f.overdue_min is not null then 0 else 1 end,
     case when p_sort = 'operational' then f.overdue_min end desc nulls last,
     case when p_sort = 'due_asc'     then f.estimated_delivery_at end asc  nulls last,
     case when p_sort = 'overdue'     then f.overdue_min           end desc nulls last,
     case when p_sort = 'created_asc' then f.created_at            end asc,
     case when p_sort = 'qty'         then f.qty                   end desc,
     case when p_sort = 'priority'
          then case f.n_priority when 'Critical' then 1 when 'Urgent' then 2
                                 when 'Normal' then 3 when 'Paused' then 4 else 5 end
     end asc,
     case when p_sort in ('operational','created_desc') then f.estimated_delivery_at end asc nulls last,
     f.created_at desc
   limit v_limit offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke all on function list_delivery_pledges_for_coordinator(uuid,uuid,text[],text,boolean,uuid,text,text,date,date,text,integer,integer) from public, anon;
grant execute on function list_delivery_pledges_for_coordinator(uuid,uuid,text[],text,boolean,uuid,text,text,date,date,text,integer,integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Özet sayıları
-- ---------------------------------------------------------------------------
-- Kartların sayıları listeden TÜRETİLMİYOR: liste sayfalanmış, kart sayısı bütünü
-- anlatmalı. Rozet de buradan besleniyor.
create or replace function delivery_pledge_summary(p_disaster uuid default null)
returns table (
  today_count     bigint,
  transit_count   bigint,
  overdue_count   bigint,
  reported_count  bigint,
  cancelled_count bigint,
  upcoming_count  bigint,
  active_count    bigint
)
language plpgsql security definer set search_path = public as $$
declare tz text := 'Europe/Istanbul';
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can read the pledge summary';
  end if;
  -- Sütunlar `b.` ile nitelendiriliyor: `status` aynı zamanda bir dönüş adı değil ama
  -- `with` bloğunun dışında çıplak bırakıldığında çözülemiyor.
  return query
  with b as (
    select p.status as st, p.estimated_delivery_at as eta, p.cancelled_at as cx
      from delivery_pledges p
     where p_disaster is null or p.disaster_id = p_disaster
  )
  select
    count(*) filter (where b.st in ('pledged','confirmed','in_transit')
                       and (b.eta at time zone tz)::date = (now() at time zone tz)::date),
    count(*) filter (where b.st = 'in_transit'),
    count(*) filter (where b.st in ('pledged','confirmed','in_transit')
                       and b.eta is not null and b.eta < now()),
    count(*) filter (where b.st = 'delivered_reported'),
    count(*) filter (where b.st = 'cancelled' and b.cx > now() - interval '30 days'),
    count(*) filter (where b.st in ('pledged','confirmed','in_transit')
                       and (b.eta at time zone tz)::date
                           between ((now() at time zone tz)::date + 1) and ((now() at time zone tz)::date + 7)),
    -- Rozet sayısı: iptal ve süresi dolmuş HARİÇ, açık iş (direktif §4).
    count(*) filter (where b.st in ('pledged','confirmed','in_transit','delivered_reported'))
  from b;
end $$;
revoke all on function delivery_pledge_summary(uuid) from public, anon;
grant execute on function delivery_pledge_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Detay
-- ---------------------------------------------------------------------------
-- Detay da MASKELİ. Tam iletişim ayrı bir çağrı ve ayrı bir denetim kaydı ister.
create or replace function get_delivery_pledge_detail(p_pledge uuid)
returns table (
  id uuid, code text,
  disaster_id uuid, disaster_name text, disaster_slug text,
  need_id uuid, need_name text, need_unit text,
  need_required integer, need_verified integer, need_remaining integer,
  qty integer, unit text,
  location_name text, estimated_at timestamptz,
  status pledge_status, overdue_minutes integer,
  notes text, cancel_reason text, cancelled_at timestamptz,
  contact_masked text, email_masked text, phone_masked text, city text,
  has_phone boolean,
  submission_id uuid, submission_code text, submission_status text,
  submission_qty integer, submission_verified integer,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can read a pledge detail';
  end if;
  return query
  select p.id, p.public_tracking_code,
         d.id, d.name, d.slug,
         n.id, n.name, n.unit,
         n.required_qty, n.verified_qty, n.remaining_qty,
         p.qty, p.unit,
         coalesce(l.name, ''), p.estimated_delivery_at,
         p.status,
         case when p.status in ('pledged','confirmed','in_transit')
               and p.estimated_delivery_at is not null
               and p.estimated_delivery_at < now()
              then greatest(0, (extract(epoch from (now() - p.estimated_delivery_at)) / 60)::integer)
              else null end,
         p.notes, p.cancel_reason, p.cancelled_at,
         mask_person(p.contact_name), mask_email(p.contact_email), mask_phone(p.contact_phone),
         coalesce(p.contact_city, ''),
         length(regexp_replace(coalesce(p.contact_phone,''), '\D', '', 'g')) >= 7,
         p.submission_id, coalesce(s.code,''), coalesce(s.status::text,''),
         s.qty, s.verified_qty,
         p.created_at, p.updated_at
    from delivery_pledges p
    join needs n     on n.id = p.need_id
    join disasters d on d.id = p.disaster_id
    left join locations   l on l.id = p.delivery_location_id
    left join submissions s on s.id = p.submission_id
   where p.id = p_pledge;
end $$;
revoke all on function get_delivery_pledge_detail(uuid) from public, anon;
grant execute on function get_delivery_pledge_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Tam iletişim — ayrı çağrı, gerekçeli, denetimli
-- ---------------------------------------------------------------------------
-- Kişinin telefonunu görmek bir işlemdir, bir görüntü değil. Ayrı fonksiyon olması
-- listenin tam veriyi hiç taşımamasını sağlıyor; gerekçe zorunluluğu ise kaydın
-- "kim, ne zaman, ne için" sorusuna cevap vermesini (rules/03 §Audit Log).
create or replace function get_delivery_pledge_contact(p_pledge uuid, p_purpose text)
returns table (full_name text, email text, phone text, city text)
language plpgsql security definer set search_path = public as $$
declare
  p          delivery_pledges;
  actor_name text;
  reason     text := btrim(coalesce(p_purpose, ''));
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can read pledge contact details';
  end if;
  if length(reason) < 3 then
    raise exception 'Kullanım amacı gerekli';
  end if;

  select * into p from delivery_pledges where id = p_pledge;
  if not found then raise exception 'Pledge not found'; end if;

  -- `full_name` aynı zamanda bu fonksiyonun DÖNÜŞ sütunu; niteliksiz yazıldığında
  -- PL/pgSQL hangisini kastettiğimizi bilemiyor. Tabloyla nitelendiriliyor.
  select coalesce(pr.full_name, 'Koordinatör') into actor_name from profiles pr where pr.id = auth.uid();

  -- Denetim kaydı ÖNCE yazılıyor: veriyi döndürüp kaydı yazamamak, görüntülemenin
  -- izsiz kalması demek olurdu.
  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (p.disaster_id, actor_name, 'Teslim sözü iletişim bilgisi görüntülendi',
          p.public_tracking_code, '—', left(reason, 200), '#8A94A6');

  return query select p.contact_name, p.contact_email, p.contact_phone, coalesce(p.contact_city,'');
end $$;
revoke all on function get_delivery_pledge_contact(uuid, text) from public, anon;
grant execute on function get_delivery_pledge_contact(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Bağlanabilecek teslimat bildirimleri
-- ---------------------------------------------------------------------------
-- Eşleştirme sinyalleri kişisel veri DEĞİL: aynı ihtiyaç, miktar, teslim noktası,
-- zaman ve takip kodu. Koordinatör kararı kendi veriyor; sistem otomatik bağlamıyor.
create or replace function list_linkable_submissions(p_pledge uuid, p_limit integer default 20)
returns table (
  id uuid, code text, qty integer, unit text,
  location_name text, submitted_at timestamptz, status text,
  contributor_masked text, qty_matches boolean
)
language plpgsql security definer set search_path = public as $$
declare p delivery_pledges;
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can list linkable delivery reports';
  end if;
  -- `id`, `code`, `qty`… bu fonksiyonun DÖNÜŞ sütunları; niteliksiz bırakılan her
  -- referans PL/pgSQL için belirsiz. Tablo takma adıyla yazılıyor.
  select * into p from delivery_pledges dp where dp.id = p_pledge;
  if not found then raise exception 'Pledge not found'; end if;

  return query
  select s.id, s.code, s.qty, s.unit, coalesce(s.location_name,''), s.submitted_at, s.status::text,
         mask_person(s.contributor_name),
         (s.qty = p.qty and lower(btrim(s.unit)) = lower(btrim(p.unit)))
    from submissions s
   where s.need_id = p.need_id
     and s.disaster_id = p.disaster_id
     -- Reddedilmiş bir bildirime bağlamak defterin yanlış kapanması olurdu.
     and s.status::text <> 'Rejected'
     -- Başka bir söze bağlı bildirim aday değil.
     and not exists (select 1 from delivery_pledges q
                      where q.submission_id = s.id and q.id <> p.id)
   order by (s.qty = p.qty) desc, s.submitted_at desc
   limit least(greatest(coalesce(p_limit,20),1), 50);
end $$;
revoke all on function list_linkable_submissions(uuid, integer) from public, anon;
grant execute on function list_linkable_submissions(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 9) Koordinatör bağlama
-- ---------------------------------------------------------------------------
-- Misafir sürümü (`link_pledge_to_submission`) kod + e-posta istiyor; koordinatörün
-- elinde e-posta yok ve olmamalı. Bu sürüm kimlikle çalışıyor ve misafir sürümünün
-- yapmadığı dört kontrolü yapıyor: operasyon uyumu, birim uyumu, bildirimin başka
-- bir söze bağlı olmaması, ve tekrar çağrının yan etkisiz olması.
--
-- MİKTARA DOKUNMUYOR. Bekleyen miktar zaten bildirimin kendisinden geliyor; kalan
-- miktar yalnızca koordinatör doğrulamasıyla değişir (rules/02).
create or replace function link_pledge_to_submission_coord(
  p_pledge uuid, p_submission uuid
) returns pledge_status
language plpgsql security definer set search_path = public as $$
declare
  p delivery_pledges;
  s submissions;
  actor_name text;
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can link a pledge to a delivery report';
  end if;

  select * into p from delivery_pledges where id = p_pledge for update;
  if not found then raise exception 'Pledge not found'; end if;

  select * into s from submissions where id = p_submission;
  if not found then raise exception 'Delivery report not found'; end if;

  -- Tekrar çağrı: aynı bağ zaten kuruluysa yeni bir denetim satırı üretmeden döner.
  if p.submission_id = s.id then
    return p.status;
  end if;
  if p.submission_id is not null then
    raise exception 'Bu teslim sözü zaten başka bir teslimat bildirimine bağlı';
  end if;
  if exists (select 1 from delivery_pledges q where q.submission_id = s.id) then
    raise exception 'Bu teslimat bildirimi zaten başka bir teslim sözüne bağlı';
  end if;
  if p.status in ('cancelled','expired','fulfilled') then
    raise exception 'Kapanmış bir teslim sözü bağlanamaz';
  end if;
  if s.need_id <> p.need_id then
    raise exception 'Teslimat bildirimi farklı bir ihtiyaca ait';
  end if;
  if s.disaster_id <> p.disaster_id then
    raise exception 'Teslimat bildirimi farklı bir operasyona ait';
  end if;
  if lower(btrim(s.unit)) <> lower(btrim(p.unit)) then
    raise exception 'Birim uyuşmuyor: % / %', p.unit, s.unit;
  end if;

  select coalesce(full_name, 'Koordinatör') into actor_name from profiles where id = auth.uid();

  update delivery_pledges
     set submission_id = s.id,
         status = case when status = 'delivered_reported' then status else 'delivered_reported' end,
         updated_at = now()
   where id = p.id;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (p.disaster_id, actor_name, 'Teslim sözü fiziksel teslimata bağlandı',
          p.public_tracking_code || ' · ' || s.code, p.status::text, 'delivered_reported', '#2A6FB0');

  return 'delivered_reported'::pledge_status;
end $$;
revoke all on function link_pledge_to_submission_coord(uuid, uuid) from public, anon;
grant execute on function link_pledge_to_submission_coord(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10) Denetim görünürlüğü
-- ---------------------------------------------------------------------------
-- Bu fazın ürettiği hiçbir eylem HERKESE AÇIK akışa düşmüyor: takip kodu, iletişim
-- verisi ve iptal gerekçesi orada görünmemeli (direktif §28). `audit_is_public()`
-- bir izin listesi olduğu için yeni adlar kendiliğinden dışarıda kalıyor —
-- aşağıdaki sorgu bunu bir kez daha ölçmek için, değiştirmek için değil.
--
--   select action from audit_log_public where action like 'Teslim sözü%';   -- 0 satır

notify pgrst, 'reload schema';
