-- Driver advances for v2 CRM.
-- Run once in Supabase SQL Editor.

create table if not exists public.v2_driver_advances (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.v2_drivers(id) on delete cascade,
  amount numeric(12, 2) not null,
  date date not null,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists idx_v2_driver_advances_driver on public.v2_driver_advances(driver_id);

alter table public.v2_driver_advances enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'v2_driver_advances' and policyname = 'v2 authenticated read'
  ) then
    create policy "v2 authenticated read" on public.v2_driver_advances for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'v2_driver_advances' and policyname = 'v2 authenticated write'
  ) then
    create policy "v2 authenticated write" on public.v2_driver_advances for all to authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'v2_driver_advances' and policyname = 'v2 anon read'
  ) then
    create policy "v2 anon read" on public.v2_driver_advances for select to anon using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'v2_driver_advances' and policyname = 'v2 anon write'
  ) then
    create policy "v2 anon write" on public.v2_driver_advances for all to anon using (true) with check (true);
  end if;
end $$;
