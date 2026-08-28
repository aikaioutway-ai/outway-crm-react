-- Табель, ручное начисление и согласование зарплаты.
-- Подготовлено 27.08.2026; применяется после завершения интерфейса финансов.

create table if not exists public.v2_payroll_entries (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null,
  subject_type text not null check (subject_type in ('driver', 'employee')),
  period_month int not null check (period_month between 1 and 12),
  period_year int not null,
  days int not null default 0,
  rate numeric(10, 2) not null default 0,
  accrued_amount numeric(12, 2),
  salary_amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, subject_type, period_month, period_year)
);

alter table public.v2_payroll_entries
  add column if not exists accrued_amount numeric(12, 2);

create index if not exists idx_v2_payroll_entries_period
  on public.v2_payroll_entries(period_month, period_year);

create table if not exists public.v2_payroll_approvals (
  id uuid primary key default gen_random_uuid(),
  school_key text not null,
  period_month int not null check (period_month between 1 and 12),
  period_year int not null,
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected')),
  submitted_by_id text,
  submitted_by_name text,
  submitted_at timestamptz,
  approved_by_id text,
  approved_by_name text,
  approved_at timestamptz,
  rejection_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_key, period_month, period_year)
);

create index if not exists idx_v2_payroll_approvals_period
  on public.v2_payroll_approvals(period_month, period_year, school_key);

create or replace function public.v2_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists v2_payroll_entries_updated_at on public.v2_payroll_entries;
create trigger v2_payroll_entries_updated_at before update on public.v2_payroll_entries
for each row execute function public.v2_touch_updated_at();

drop trigger if exists v2_payroll_approvals_updated_at on public.v2_payroll_approvals;
create trigger v2_payroll_approvals_updated_at before update on public.v2_payroll_approvals
for each row execute function public.v2_touch_updated_at();

alter table public.v2_payroll_entries enable row level security;
alter table public.v2_payroll_approvals enable row level security;

-- Табель пока использует существующую браузерную модель доступа CRM.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'v2_payroll_entries' and policyname = 'v2 authenticated read') then
    create policy "v2 authenticated read" on public.v2_payroll_entries for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'v2_payroll_entries' and policyname = 'v2 authenticated write') then
    create policy "v2 authenticated write" on public.v2_payroll_entries for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'v2_payroll_entries' and policyname = 'v2 anon read') then
    create policy "v2 anon read" on public.v2_payroll_entries for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'v2_payroll_entries' and policyname = 'v2 anon write') then
    create policy "v2 anon write" on public.v2_payroll_entries for all to anon using (true) with check (true);
  end if;
end $$;

-- У таблицы согласований нет клиентских RLS-политик: чтение и подпись идут
-- только через payroll-approval-api, который проверяет подписанную сессию.
