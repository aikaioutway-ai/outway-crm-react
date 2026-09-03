create table if not exists public.v2_b2b_attachments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.v2_b2b_orders(id) on delete cascade,
  file_name text not null,
  file_path text not null unique,
  content_type text,
  file_size bigint not null default 0 check (file_size >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_v2_b2b_attachments_order
  on public.v2_b2b_attachments(order_id, created_at desc);

alter table public.v2_b2b_attachments enable row level security;

create policy "v2 b2b attachments anon access" on public.v2_b2b_attachments
for all to anon using (true) with check (true);
create policy "v2 b2b attachments authenticated access" on public.v2_b2b_attachments
for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit)
values ('b2b-attachments', 'b2b-attachments', false, 20971520)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

create policy "anon read b2b attachments" on storage.objects
for select to anon using (bucket_id = 'b2b-attachments');
create policy "anon upload b2b attachments" on storage.objects
for insert to anon with check (bucket_id = 'b2b-attachments');
create policy "anon delete b2b attachments" on storage.objects
for delete to anon using (bucket_id = 'b2b-attachments');
create policy "authenticated read b2b attachments" on storage.objects
for select to authenticated using (bucket_id = 'b2b-attachments');
create policy "authenticated upload b2b attachments" on storage.objects
for insert to authenticated with check (bucket_id = 'b2b-attachments');
create policy "authenticated delete b2b attachments" on storage.objects
for delete to authenticated using (bucket_id = 'b2b-attachments');
