-- Aggregated per-branch KPI stats, computed in Postgres instead of pulling
-- every family/child row to the client and reducing there.
--
-- Mirrors computeSchoolStats() in src/modules/families/ManagerOverview.tsx:
-- - children_count / new_requests are counted per CHILD row (all statuses,
--   including rejected — computeSchoolStats does not filter status except
--   for new_requests).
-- - charged / paid / pending_count / pending_sum / debt_sum / balance are
--   FAMILY-level totals, summed once per distinct family that has at least
--   one child in the branch (not once per child — a family with 2 children
--   in the same branch must not double its charged/paid/debt amounts).
--
-- Safe to run multiple times in Supabase SQL Editor (create or replace).

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
      count(*) filter (where c.status = 'new') as new_requests,
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

-- family_id is the join key for every per-branch aggregate above; without
-- this index the family_money CTE does a seq scan per branch at 3000+ rows.
create index if not exists idx_v2_families_summary_family_id
  on public.v2_families_summary(family_id);
