-- Раздел «Сводка» → вкладка «Прогноз» (решение владельца 2026-10-28).
--
-- Считаем только микроавтобусы:
--   Revenue  — начисления семьям за месяц по детям, которые сидят в
--              активных микроавтобусных трансферах (без отказников и
--              отменённых начислений). Нет начислений — 0.
--   COGS     — число активных микроавтобусных трансферов × 4000 × рабочие
--              дни месяца. Рабочие дни (14–24) выбираются в CRM и общие для
--              всех, кто видит «Сводку»; по умолчанию 20.
--
-- Читать могут все сессии CRM (как остальные v2_* справочники), менять число
-- дней — только edge-функция summary-api (service_role) после проверки роли.
--
-- Откат: drop function public.get_summary_forecast(int, int);
--        drop table public.v2_summary_working_days;

create table if not exists public.v2_summary_working_days (
  period_year int not null check (period_year between 2020 and 2100),
  period_month int not null check (period_month between 1 and 12),
  days int not null check (days between 14 and 24),
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (period_year, period_month)
);

alter table public.v2_summary_working_days enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'v2_summary_working_days' and policyname = 'v2 anon read') then
    create policy "v2 anon read" on public.v2_summary_working_days for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'v2_summary_working_days' and policyname = 'v2 authenticated read') then
    create policy "v2 authenticated read" on public.v2_summary_working_days for select to authenticated using (true);
  end if;
end $$;

create or replace function public.get_summary_forecast(p_year int, p_month int)
returns table (
  branch_id uuid,
  branch_code text,
  branch_name text,
  revenue numeric,
  microbus_count bigint
)
language sql
stable
as $$
  with revenue as (
    select c.branch_id, sum(ch.amount) as revenue
    from public.v2_charges ch
    join public.v2_children c on c.id = ch.child_id
    join public.v2_transfers t on t.id = c.transfer_id
    where ch.period_year = p_year
      and ch.period_month = p_month
      and ch.status <> 'cancelled'
      and c.status <> 'rejected'
      and t.vehicle_type = 'microbus'
      and t.status = 'active'
      and not coalesce(t.is_test, false)
    group by c.branch_id
  ),
  buses as (
    select t.branch_id, count(*) as microbus_count
    from public.v2_transfers t
    where t.vehicle_type = 'microbus'
      and t.status = 'active'
      and not coalesce(t.is_test, false)
    group by t.branch_id
  )
  select
    b.id as branch_id,
    b.code as branch_code,
    b.name as branch_name,
    coalesce(r.revenue, 0) as revenue,
    coalesce(bu.microbus_count, 0) as microbus_count
  from public.v2_school_branches b
  left join revenue r on r.branch_id = b.id
  left join buses bu on bu.branch_id = b.id
  where r.branch_id is not null or bu.branch_id is not null;
$$;

grant execute on function public.get_summary_forecast(int, int) to anon, authenticated;
