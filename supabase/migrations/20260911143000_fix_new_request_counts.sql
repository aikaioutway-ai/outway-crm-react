-- A new application is a child that still has the `new` status and has not
-- yet been assigned to a transfer. Keep the server-side KPI aligned with the
-- quick filter used by all family/logistics dashboards.

create or replace function public.get_branch_stats()
returns table (
  branch_id uuid,
  branch_code text,
  branch_short text,
  branch_name text,
  children_count bigint,
  new_requests bigint,
  families_count bigint,
  with_transfer_count bigint,
  without_transfer_count bigint,
  charged numeric,
  paid numeric,
  pending_count bigint,
  pending_sum numeric,
  debt_sum numeric,
  balance numeric
)
language sql
stable
as $$
  with branch_family as (
    select distinct c.branch_id, c.family_id
    from public.v2_children c
    where c.branch_id is not null
  ),
  family_money as (
    select
      bf.branch_id,
      bf.family_id,
      coalesce(s.total_charged, 0) as total_charged,
      coalesce(s.total_paid, 0) as total_paid,
      coalesce(s.pending_count, 0) as pending_count,
      coalesce(s.pending_amount, 0) as pending_amount,
      coalesce(s.debt_amount, 0) as debt_amount,
      coalesce(w.main_balance, 0) as main_balance
    from branch_family bf
    left join public.v2_families_summary s on s.family_id = bf.family_id
    left join public.v2_family_wallets w on w.family_id = bf.family_id
  ),
  branch_children_agg as (
    select
      c.branch_id,
      count(*) as children_count,
      count(*) filter (where c.status = 'new' and c.transfer_id is null) as new_requests,
      count(*) filter (where c.transfer_id is not null) as with_transfer_count,
      count(*) filter (where c.transfer_id is null) as without_transfer_count
    from public.v2_children c
    where c.branch_id is not null
    group by c.branch_id
  ),
  branch_money_agg as (
    select
      branch_id,
      count(*) as families_count,
      sum(total_charged) as charged,
      sum(total_paid) as paid,
      sum(pending_count) as pending_count,
      sum(pending_amount) as pending_sum,
      sum(greatest(debt_amount, 0)) as debt_sum,
      sum(main_balance) as balance
    from family_money
    group by branch_id
  )
  select
    b.id as branch_id,
    b.code as branch_code,
    b.short_name as branch_short,
    b.name as branch_name,
    coalesce(ca.children_count, 0) as children_count,
    coalesce(ca.new_requests, 0) as new_requests,
    coalesce(ma.families_count, 0) as families_count,
    coalesce(ca.with_transfer_count, 0) as with_transfer_count,
    coalesce(ca.without_transfer_count, 0) as without_transfer_count,
    coalesce(ma.charged, 0) as charged,
    coalesce(ma.paid, 0) as paid,
    coalesce(ma.pending_count, 0) as pending_count,
    coalesce(ma.pending_sum, 0) as pending_sum,
    coalesce(ma.debt_sum, 0) as debt_sum,
    coalesce(ma.balance, 0) as balance
  from public.v2_school_branches b
  left join branch_children_agg ca on ca.branch_id = b.id
  left join branch_money_agg ma on ma.branch_id = b.id;
$$;

grant execute on function public.get_branch_stats() to anon, authenticated;
