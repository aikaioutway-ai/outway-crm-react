-- «Сводка → Прогноз»: COGS считает только микроавтобусы, в которых едет хотя
-- бы один ребёнок (не отказ) — так же, как «Микробусы» в Логистике
-- (решение владельца 2026-10-28). Пустые активные трансферы водителю не
-- оплачиваются и в прогноз не входят.
--
-- Откат: заново выполнить get_summary_forecast из
-- 20261028120000_summary_forecast.sql (там buses без условия exists).

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
      and exists (
        select 1 from public.v2_children c
        where c.transfer_id = t.id and c.status <> 'rejected'
      )
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
