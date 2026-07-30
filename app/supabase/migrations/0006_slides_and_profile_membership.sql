-- AfetHUB — migration 0006
-- (a) Home banner slides, managed from the coordinator panel.
-- (b) Profile contact details and organization membership.
--
-- Additive and idempotent.
-- =============================================================================

-- ---------- (a) banner_slides ------------------------------------------------
do $$ begin
  create type slide_action as enum ('reportDisaster','howItWorks','orgs','home','track');
exception when duplicate_object then null; end $$;

create table if not exists banner_slides (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(btrim(title)) between 3 and 90),
  body       text not null check (length(btrim(body)) between 3 and 400),
  cta_label  text not null check (length(btrim(cta_label)) between 1 and 40),
  action     slide_action not null default 'reportDisaster',
  -- Local paths only. An admin-supplied remote URL would be fetched by every
  -- visitor's browser: it can impersonate an institution's imagery and it leaks
  -- visitor IPs to a third party (rules/03 §File Uploads). Files live in
  -- app/public/banners/ and ship with the deployment.
  image      text not null default '' check (image = '' or image ~ '^/banners/[A-Za-z0-9._-]+\.(webp|png|svg|jpg)$'),
  tint       text not null default '#D9363E' check (tint ~ '^#[0-9A-Fa-f]{6}$'),
  active     boolean not null default true,
  sort_order integer not null default 1 check (sort_order between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists banner_slides_order_idx on banner_slides (active, sort_order);

alter table banner_slides enable row level security;

-- The slider is public content: anyone may read the active slides.
drop policy if exists banner_slides_public_read on banner_slides;
create policy banner_slides_public_read on banner_slides
  for select using (active = true or is_coordinator());

-- Writes are coordinator-only, enforced here rather than by the UI hiding a button.
drop policy if exists banner_slides_coord_write on banner_slides;
create policy banner_slides_coord_write on banner_slides
  for all using (is_coordinator()) with check (is_coordinator());

grant select on banner_slides to anon, authenticated;
grant insert, update, delete on banner_slides to authenticated;

-- Ship the default slides so a fresh database is not blank. Guarded so re-running
-- the migration does not duplicate them.
insert into banner_slides (title, body, cta_label, action, image, tint, active, sort_order)
select * from (values
  ('Bir olay gördüyseniz bildirin',
   'Yangın, sel, deprem veya şiddetli hava olayını hesap açmadan bildirin. Aynı olaya ait bildirimler birleştirilir ve koordinatör incelemesine tek kayıt olarak düşer.',
   'Afet Bildir', 'reportDisaster'::slide_action, '/banners/wildfire.webp', '#D9363E', true, 1),
  ('Sayılar nasıl doğrulanıyor',
   'Kalan miktar yalnızca koordinatörün teslim aldığını onayladığı kadar düşer. Bekleyen bildirimler bilgi amaçlıdır ve hiçbir sayıyı değiştirmez.',
   'Doğrulama Nasıl İşler', 'howItWorks'::slide_action, '/banners/coordination.webp', '#159947', true, 2),
  ('Kurumlar ve gönüllü grupları',
   'Afetlerde çalışan kamu kurumlarının, belediyelerin, derneklerin ve gönüllü gruplarının iletişim bilgilerini tek listede bulun; eksik bir kurumu siz de ekleyin.',
   'Kurumlar', 'orgs'::slide_action, '/banners/volunteers.webp', '#2A6FB0', true, 3)
) as v(title, body, cta_label, action, image, tint, active, sort_order)
where not exists (select 1 from banner_slides);

-- ---------- (b) profile contact + membership ---------------------------------
alter table profiles add column if not exists phone           text not null default '';
alter table profiles add column if not exists city            text not null default '';
alter table profiles add column if not exists organization_id uuid references organizations(id) on delete set null;
alter table profiles add column if not exists org_title       text not null default '';
-- Coordinator-set: a self-declared affiliation is a claim, not proof. The account
-- page can change organization_id/org_title but must never be able to set this.
alter table profiles add column if not exists org_verified    boolean not null default false;

create index if not exists profiles_org_idx on profiles (organization_id) where organization_id is not null;

-- Self-service update policy: a user may edit their own contact details and declare a
-- membership, and nothing else. `role` and `org_verified` are protected by the WITH
-- CHECK clause below — it compares the new row against the existing one, so an update
-- that tries to change either is rejected regardless of what the client sends.
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from profiles p where p.id = auth.uid())
    and org_verified = (select p.org_verified from profiles p where p.id = auth.uid())
  );

-- Changing the declared organization invalidates the previous verification: a
-- coordinator confirmed membership of that organization, not of a different one.
create or replace function profiles_reset_org_verification()
returns trigger language plpgsql as $$
begin
  if new.organization_id is distinct from old.organization_id then
    new.org_verified := false;
  end if;
  return new;
end $$;

drop trigger if exists profiles_reset_org_verification_trg on profiles;
create trigger profiles_reset_org_verification_trg
  before update of organization_id on profiles
  for each row execute function profiles_reset_org_verification();

-- Note: `profiles` is NOT publicly readable and this migration does not change that.
-- Contact details and membership are operational data; nothing here is exposed to anon
-- (rules/01 §Public Access, rules/03 §Contact Information).
