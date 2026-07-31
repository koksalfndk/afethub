-- Afet bildiriminde etkilenen mahalle / köyler.
--
-- Neden: bildirim şu an "Muğla / Seydikemer" kadar iniyor; koordinatör operasyonu
-- açtığında hangi mahallelerin etkilendiğini SIFIRDAN soruyor. Bildiren kişi bunu
-- zaten biliyor. Serbest metin ("Konum tarifi") kalıyor ama toplanamıyor: aynı köy
-- üç bildirimde üç yazımla girildiğinde hiçbiri eşleşmiyor.
--
-- Boş dizi = KAYDEDİLMEDİ, "hiçbir mahalle etkilenmedi" DEĞİL.
alter table disaster_reports
  add column if not exists settlements text[] not null default '{}';

-- Görünüm yeniden kuruluyor: `create or replace view` mevcut sütunların ARASINA
-- yeni bir sütun ekleyemiyor (42P16). Bağımlı bir nesne yok, drop güvenli.
drop view if exists disaster_reports_public;
create view disaster_reports_public as
  select r.id, r.type, r.province, r.district, r.location_note, r.occurred_on,
         r.description, r.report_count, r.status, r.created_at, r.last_report_at,
         r.settlements, d.slug as disaster_slug
    from disaster_reports r
    left join disasters d on d.id = r.disaster_id
   where r.status <> 'Rejected'::report_status;

grant select on disaster_reports_public to anon, authenticated;

-- Bildirim gönderimi: mahalle listesi eklendi.
--
-- BİRLEŞTİRMEDE BİRLEŞİM ALINIYOR (union), üzerine yazılmıyor. Aynı yangını bildiren
-- iki kişi farklı köyler sayabilir; ikincisinin listesiyle birincisininkini silmek,
-- gerçekten etkilenmiş bir yerleşimi kayıttan düşürmek olurdu.
drop function if exists public.submit_disaster_report(disaster_type, text, text, text, date, text, text, text, text);
create function public.submit_disaster_report(
  p_type disaster_type, p_province text, p_district text, p_location_note text,
  p_occurred_on date, p_description text, p_name text, p_email text, p_phone text,
  p_settlements text[] default '{}'
)
returns table(
  id uuid, type disaster_type, province text, district text, location_note text,
  occurred_on date, description text, report_count integer,
  status report_status, disaster_slug text, created_at timestamptz,
  last_report_at timestamptz, settlements text[], merged boolean
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_existing uuid;
  v_id       uuid;
  v_merged   boolean := false;
  v_before   integer;
  v_clean    text[];
begin
  if length(btrim(p_description)) = 0 then
    raise exception 'description required';
  end if;

  -- Boş ve yinelenen adlar temizlenir.
  select coalesce(array_agg(distinct btrim(s)), '{}')
    into v_clean
    from unnest(coalesce(p_settlements, '{}'::text[])) as s
   where btrim(s) <> '';

  v_existing := find_same_event_report(p_type, p_province, p_district, p_occurred_on);

  if v_existing is not null then
    select r.report_count into v_before from disaster_reports r where r.id = v_existing for update;
    update disaster_reports r set
      report_count   = r.report_count + 1,
      last_report_at = now(),
      district       = case when btrim(r.district) = '' then btrim(p_district) else r.district end,
      settlements    = (
        select coalesce(array_agg(distinct x), '{}')
          from unnest(r.settlements || v_clean) as x
      )
    where r.id = v_existing;
    v_id := v_existing;
    v_merged := true;
  else
    insert into disaster_reports (type, province, district, location_note, settlements, occurred_on, description)
    values (p_type, btrim(p_province), btrim(p_district), btrim(p_location_note), v_clean, p_occurred_on, btrim(p_description))
    returning disaster_reports.id into v_id;
    v_before := 0;
  end if;

  insert into disaster_report_contacts (report_id, name, email, phone)
  values (v_id, btrim(p_name), btrim(p_email), btrim(p_phone));

  if btrim(p_email) <> '' and position('@' in btrim(p_email)) > 1 then
    insert into disaster_report_confirmations (report_id, name, email, province, district)
    values (v_id,
            case when length(btrim(p_name)) >= 3 then btrim(p_name) else 'Bildiren' end,
            lower(btrim(p_email)), btrim(p_province), btrim(p_district))
    on conflict (report_id, email) do nothing;
  end if;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  select
    r.disaster_id, 'Vatandaş',
    case when v_merged then 'Afet bildirimi birleştirildi' else 'Afet bildirimi gönderildi' end,
    r.province || coalesce(' / ' || nullif(r.district, ''), '') || ' · ' || disaster_type_label(r.type),
    case when v_merged then v_before::text || ' kişi bildirdi' else '—' end,
    r.report_count::text || ' kişi bildirdi',
    '#E6A700'
  from disaster_reports r where r.id = v_id;

  return query
    select v.id, v.type, v.province, v.district, v.location_note, v.occurred_on,
           v.description, v.report_count, v.status, v.disaster_slug,
           v.created_at, v.last_report_at, v.settlements, v_merged
    from disaster_reports_public v where v.id = v_id;
end $function$;

grant execute on function public.submit_disaster_report(disaster_type, text, text, text, date, text, text, text, text, text[]) to anon, authenticated;

-- Operasyon açılırken ilçe ve mahalleler de taşınır: bildiren kişinin verdiği bilgi
-- koordinatöre yeniden sorulmaz.
create or replace function public.open_disaster_from_report(p_report uuid, p_community boolean)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r        disaster_reports;
  v_name   text;
  v_slug   text;
  v_try    text;
  v_n      integer := 1;
  v_id     uuid;
  v_region text;
begin
  select * into r from disaster_reports where id = p_report for update;
  if not found then raise exception 'report not found'; end if;
  if r.disaster_id is not null then
    return (select d.slug from disasters d where d.id = r.disaster_id);
  end if;

  v_name := coalesce(nullif(btrim(r.district), ''), btrim(r.province)) || ' ' || disaster_type_label(r.type);
  v_region := coalesce(nullif(btrim(r.district), '') || ', ', '') || btrim(r.province) || ' · Türkiye';

  v_slug := community_slugify(v_name) || '-' || to_char(now() at time zone 'utc', 'DD-MM-YYYY');
  v_try := v_slug;
  while exists (select 1 from disasters d where d.slug = v_try) loop
    v_n := v_n + 1;
    v_try := v_slug || '-' || v_n::text;
  end loop;

  insert into disasters (
    slug, name, region, province, districts, settlements, type, status, situation, opened_at,
    opened_by_community, community_confirmed_at
  )
  values (
    v_try, v_name, v_region, btrim(r.province),
    case when btrim(coalesce(r.district, '')) = '' then '{}'::text[] else array[btrim(r.district)] end,
    r.settlements,
    r.type, 'Active',
    case when p_community
      then 'Bu operasyon, aynı olayı bildiren en az ' || community_report_threshold()::text ||
           ' kişinin doğrulamasıyla otomatik açıldı. Koordinatör doğrulaması bekleniyor.' ||
           coalesce(E'\n\n' || nullif(btrim(r.description), ''), '')
      else coalesce(nullif(btrim(r.description), ''), '') end,
    (now() at time zone 'utc')::date,
    true,
    case when p_community then null else now() end
  )
  returning id into v_id;

  update disaster_reports set status = 'Published', disaster_id = v_id where id = p_report;

  insert into audit_log (disaster_id, actor, action, detail, old_value, new_value, color)
  values (
    v_id,
    case when p_community then 'Topluluk'
         else coalesce((select full_name from profiles where id = auth.uid()), 'Koordinatör') end,
    'Topluluk afeti oluşturuldu',
    v_name || ' · ' || r.report_count::text || ' kişi bildirdi',
    'Topluluk bildirimi',
    case when p_community then 'Afet · koordinatör doğrulaması bekleniyor' else 'Afet · koordinatör doğruladı' end,
    '#E6A700'
  );

  return v_try;
end $function$;

notify pgrst, 'reload schema';
