-- Документы и авансы офисных сотрудников.
create table if not exists public.v2_employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references public.v2_employees(id) on delete cascade,
  document_type text not null check (document_type in ('passport', 'contract')),
  title text not null,
  document_number text,
  issued_at date,
  expires_at date,
  required boolean not null default true,
  scan_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, document_type)
);

create index if not exists idx_v2_employee_documents_employee
  on public.v2_employee_documents(employee_id);

drop trigger if exists trg_v2_employee_documents_updated_at on public.v2_employee_documents;
create trigger trg_v2_employee_documents_updated_at
before update on public.v2_employee_documents
for each row execute function public.v2_touch_updated_at();

create table if not exists public.v2_employee_advances (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references public.v2_employees(id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  date date not null,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists idx_v2_employee_advances_employee_date
  on public.v2_employee_advances(employee_id, date desc);

alter table public.v2_employee_documents enable row level security;
alter table public.v2_employee_advances enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['v2_employee_documents', 'v2_employee_advances'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = table_name and policyname = 'v2 anon read') then
      execute format('create policy "v2 anon read" on public.%I for select to anon using (true)', table_name);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = table_name and policyname = 'v2 anon write') then
      execute format('create policy "v2 anon write" on public.%I for all to anon using (true) with check (true)', table_name);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = table_name and policyname = 'v2 authenticated read') then
      execute format('create policy "v2 authenticated read" on public.%I for select to authenticated using (true)', table_name);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = table_name and policyname = 'v2 authenticated write') then
      execute format('create policy "v2 authenticated write" on public.%I for all to authenticated using (true) with check (true)', table_name);
    end if;
  end loop;
end $$;

insert into storage.buckets (id, name, public)
values ('employee-documents', 'employee-documents', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "anon read employee documents" on storage.objects;
drop policy if exists "anon upload employee documents" on storage.objects;
drop policy if exists "authenticated read employee documents" on storage.objects;
drop policy if exists "authenticated upload employee documents" on storage.objects;

create policy "anon read employee documents" on storage.objects
for select to anon using (bucket_id = 'employee-documents');
create policy "anon upload employee documents" on storage.objects
for insert to anon with check (bucket_id = 'employee-documents');
create policy "authenticated read employee documents" on storage.objects
for select to authenticated using (bucket_id = 'employee-documents');
create policy "authenticated upload employee documents" on storage.objects
for insert to authenticated with check (bucket_id = 'employee-documents');
