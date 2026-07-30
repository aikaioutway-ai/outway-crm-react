-- Табель/зарплата водителей и офисных сотрудников для v2 CRM.
-- Одна запись на (сотрудника, месяц, год) — дни, ставка, начисленная зарплата.
-- Run once in Supabase SQL Editor.

create table if not exists public.v2_payroll_entries (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null,           -- driver_id (uuid как text) или employee id ('emp-...')
  subject_type text not null check (subject_type in ('driver', 'employee')),
  period_month int not null check (period_month between 1 and 12),
  period_year int not null,
  days int not null default 0,
  rate numeric(10, 2) not null default 0,
  salary_amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, subject_type, period_month, period_year)
);

create index if not exists idx_v2_payroll_entries_period
  on public.v2_payroll_entries(period_month, period_year);

-- Функция updated_at (на случай если crm_v2_schema.sql/employees_schema.sql ещё не запускались)
create or replace function public.v2_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists v2_payroll_entries_updated_at on public.v2_payroll_entries;
create trigger v2_payroll_entries_updated_at
  before update on public.v2_payroll_entries
  for each row execute function public.v2_touch_updated_at();

alter table public.v2_payroll_entries enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'v2_payroll_entries' and policyname = 'v2 authenticated read'
  ) then
    create policy "v2 authenticated read" on public.v2_payroll_entries for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'v2_payroll_entries' and policyname = 'v2 authenticated write'
  ) then
    create policy "v2 authenticated write" on public.v2_payroll_entries for all to authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'v2_payroll_entries' and policyname = 'v2 anon read'
  ) then
    create policy "v2 anon read" on public.v2_payroll_entries for select to anon using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'v2_payroll_entries' and policyname = 'v2 anon write'
  ) then
    create policy "v2 anon write" on public.v2_payroll_entries for all to anon using (true) with check (true);
  end if;
end $$;
