-- School totals (Начислено / Оплачено / Сумма долга) without refused children.
--
-- Decision of the owner (2026-10-22):
--   * children with status 'rejected' keep their charges and debts in the DB
--     (family card, 'Отказ' chip), but they are not part of school totals;
--   * debt is counted per child: an overpayment for one child must not hide
--     another child's debt (overpayments go back to the family balance and are
--     re-allocated separately).
-- charged / paid / debt_sum now come from v2_charges per child of the branch,
-- so a family with children in two schools is no longer counted in both.
-- pending_count / pending_sum, balance (family wallet), families_count and the
-- child counters are unchanged.
--
-- Rollback: re-run the previous definition from
-- 20260911143000_fix_new_request_counts.sql (identical to the live version
-- before this migration; copied below).
--
--   with branch_family as (
--     select distinct c.branch_id, c.family_id from public.v2_children c where c.branch_id is not null
--   ),
--   family_money as (
--     select bf.branch_id, bf.family_id,
--       coalesce(s.total_charged, 0) as total_charged, coalesce(s.total_paid, 0) as total_paid,
--       coalesce(s.pending_count, 0) as pending_count, coalesce(s.pending_amount, 0) as pending_amount,
--       coalesce(s.debt_amount, 0) as debt_amount, coalesce(w.main_balance, 0) as main_balance
--     from branch_family bf
--     left join public.v2_families_summary s on s.family_id = bf.family_id
--     left join public.v2_family_wallets w on w.family_id = bf.family_id
--   ),
--   ... branch_money_agg: sum(total_charged) as charged, sum(total_paid) as paid,
--       sum(greatest(debt_amount, 0)) as debt_sum ...

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
      coalesce(s.pending_count, 0) as pending_count,
      coalesce(s.pending_amount, 0) as pending_amount,
      coalesce(w.main_balance, 0) as main_balance
    from branch_family bf
    left join public.v2_families_summary s on s.family_id = bf.family_id
    left join public.v2_family_wallets w on w.family_id = bf.family_id
  ),
  child_money as (
    select
      c.branch_id,
      c.id as child_id,
      sum(ch.amount) as charged,
      sum(ch.paid_amount) as paid
    from public.v2_children c
    join public.v2_charges ch on ch.child_id = c.id
    where c.branch_id is not null
      and c.status <> 'rejected'
    group by c.branch_id, c.id
  ),
  branch_charges_agg as (
    select
      branch_id,
      sum(charged) as charged,
      sum(paid) as paid,
      sum(greatest(charged - paid, 0)) as debt_sum
    from child_money
    group by branch_id
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
      sum(pending_count) as pending_count,
      sum(pending_amount) as pending_sum,
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
    coalesce(cha.charged, 0) as charged,
    coalesce(cha.paid, 0) as paid,
    coalesce(ma.pending_count, 0) as pending_count,
    coalesce(ma.pending_sum, 0) as pending_sum,
    coalesce(cha.debt_sum, 0) as debt_sum,
    coalesce(ma.balance, 0) as balance
  from public.v2_school_branches b
  left join branch_children_agg ca on ca.branch_id = b.id
  left join branch_money_agg ma on ma.branch_id = b.id
  left join branch_charges_agg cha on cha.branch_id = b.id;
$$;

grant execute on function public.get_branch_stats() to anon, authenticated;
