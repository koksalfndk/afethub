-- Yerel doğrulama iskeleti — Supabase'in sağladığı ama boş bir PostgreSQL'de
-- olmayan roller ve şemalar. ÜRETİMDE ÇALIŞTIRILMAZ; yalnızca kabın içindeki
-- geçici veritabanına şema + migration zincirini uygulayabilmek için.
do $$ begin create role anon nologin;           exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin;  exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin;   exception when duplicate_object then null; end $$;
do $$ begin create role authenticator noinherit login; exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;

-- Supabase `public` şeması üzerinde bu izni kurulumda veriyor. Yerel iskelette
-- açıkça yazılması gerekiyor: PostgreSQL 15'ten beri yeni oluşturulan bir şema
-- yalnızca sahibine açık, ve testler şemayı sıfırlayıp yeniden kuruyor. İzin
-- olmadan `set local role anon` altındaki her sorgu
-- "permission denied for schema public" ile düşüyor — tablo yokmuş gibi görünür.
grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
grant usage on schema auth, storage to anon, authenticated, service_role;
create extension if not exists pgcrypto with schema public;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Supabase'de bu değerler JWT'den gelir. Yerelde `set local request.jwt.claim.sub`
-- ile taklit ediliyor.
-- Supabase'in gerçek sürümü iki kaynağa da bakar: eski `request.jwt.claim.<x>`
-- ayarları ve yeni `request.jwt.claims` JSON'u. Testler ikincisini kullanıyor.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'anon');
$$;

create or replace function auth.email() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email');
$$;

create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz default now()
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select string_to_array(regexp_replace(coalesce(name, ''), '/[^/]*$', ''), '/');
$$;
