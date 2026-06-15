insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', true)
on conflict (id) do update set public = true;

drop policy if exists "anon read payment receipts" on storage.objects;
drop policy if exists "anon upload payment receipts" on storage.objects;

create policy "anon read payment receipts"
on storage.objects for select
to anon
using (bucket_id = 'payment-receipts');

create policy "anon upload payment receipts"
on storage.objects for insert
to anon
with check (bucket_id = 'payment-receipts');
