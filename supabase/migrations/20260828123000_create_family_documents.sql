-- Документы клиентов: два стандартных пункта и неограниченные дополнительные документы.
create table if not exists public.v2_family_documents (
  id uuid primary key default gen_random_uuid(),
  family_id text not null references public.v2_families(id) on delete cascade,
  document_key text not null,
  title text not null,
  document_number text,
  issued_at date,
  scan_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, document_key)
);

create index if not exists idx_v2_family_documents_family
  on public.v2_family_documents(family_id, sort_order);

drop trigger if exists trg_v2_family_documents_updated_at on public.v2_family_documents;
create trigger trg_v2_family_documents_updated_at
before update on public.v2_family_documents
for each row execute function public.v2_touch_updated_at();

alter table public.v2_family_documents enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'v2_family_documents' and policyname = 'v2 anon read') then
    create policy "v2 anon read" on public.v2_family_documents for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'v2_family_documents' and policyname = 'v2 anon write') then
    create policy "v2 anon write" on public.v2_family_documents for all to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'v2_family_documents' and policyname = 'v2 authenticated read') then
    create policy "v2 authenticated read" on public.v2_family_documents for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'v2_family_documents' and policyname = 'v2 authenticated write') then
    create policy "v2 authenticated write" on public.v2_family_documents for all to authenticated using (true) with check (true);
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('family-documents', 'family-documents', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "anon read family documents" on storage.objects;
drop policy if exists "anon upload family documents" on storage.objects;
drop policy if exists "authenticated read family documents" on storage.objects;
drop policy if exists "authenticated upload family documents" on storage.objects;

create policy "anon read family documents" on storage.objects
for select to anon using (bucket_id = 'family-documents');
create policy "anon upload family documents" on storage.objects
for insert to anon with check (bucket_id = 'family-documents');
create policy "authenticated read family documents" on storage.objects
for select to authenticated using (bucket_id = 'family-documents');
create policy "authenticated upload family documents" on storage.objects
for insert to authenticated with check (bucket_id = 'family-documents');
