-- Driver documents for v2 CRM.
-- Run once in Supabase SQL Editor.

create or replace function public.v2_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.v2_driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.v2_drivers(id) on delete cascade,
  document_type text not null check (document_type in (
    'license',
    'contract',
    'insurance',
    'patent',
    'vehicle_certificate',
    'driver_license',
    'passport'
  )),
  title text not null,
  document_number text,
  issued_at date,
  expires_at date,
  required boolean not null default true,
  scan_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (driver_id, document_type)
);

alter table public.v2_driver_documents
  add column if not exists scan_url text;

drop trigger if exists trg_v2_driver_documents_updated_at on public.v2_driver_documents;
create trigger trg_v2_driver_documents_updated_at before update on public.v2_driver_documents
for each row execute function public.v2_touch_updated_at();

create index if not exists idx_v2_driver_documents_driver on public.v2_driver_documents(driver_id);

alter table public.v2_driver_documents enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'v2_driver_documents' and policyname = 'v2 authenticated read'
  ) then
    create policy "v2 authenticated read" on public.v2_driver_documents for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'v2_driver_documents' and policyname = 'v2 authenticated write'
  ) then
    create policy "v2 authenticated write" on public.v2_driver_documents for all to authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'v2_driver_documents' and policyname = 'v2 anon read'
  ) then
    create policy "v2 anon read" on public.v2_driver_documents for select to anon using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'v2_driver_documents' and policyname = 'v2 anon write'
  ) then
    create policy "v2 anon write" on public.v2_driver_documents for all to anon using (true) with check (true);
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('driver-documents', 'driver-documents', true)
on conflict (id) do nothing;

drop policy if exists "anon read driver documents" on storage.objects;
drop policy if exists "anon upload driver documents" on storage.objects;
drop policy if exists "authenticated read driver documents" on storage.objects;
drop policy if exists "authenticated upload driver documents" on storage.objects;

create policy "anon read driver documents"
on storage.objects for select
to anon
using (bucket_id = 'driver-documents');

create policy "anon upload driver documents"
on storage.objects for insert
to anon
with check (bucket_id = 'driver-documents');

create policy "authenticated read driver documents"
on storage.objects for select
to authenticated
using (bucket_id = 'driver-documents');

create policy "authenticated upload driver documents"
on storage.objects for insert
to authenticated
with check (bucket_id = 'driver-documents');
