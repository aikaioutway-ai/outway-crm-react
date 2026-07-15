-- Server-side pagination + filtering for the main families/children table
-- (FamiliesPage.tsx), replacing the "fetch all 5 tables fully, join in JS"
-- pattern in fetchV2FamiliesTable(). Pagination unit is the FAMILY, not the
-- child row — a family's children are never split across pages, and
-- is_first_child is computed deterministically from a stable child order
-- (today's client-side version has no ORDER BY on the children query, so
-- "first child" is whatever order Postgres happens to return).
--
-- Deliberate behavior change vs. today: search matches at the FAMILY level
-- (parent name/phone/contact OR any child's name) and, when it matches,
-- returns ALL of that family's children — not just the one row that
-- happened to match. Today's client-side filter matches each child ROW
-- independently, so a 3-child family where only child #2 matches shows only
-- that one row, with isFirstChild still false (computed once at fetch time
-- from the original unfiltered order) — meaning the parent's name/phone/
-- financials silently don't render for that search result. Family-level
-- matching is more predictable and fixes that; flagging it explicitly since
-- it's a visible change in what a search returns.
--
-- p_branch_ids is used for BOTH the school-tab filter and the employee's
-- allowedSchools access restriction — the client resolves "which branch_ids
-- does this tab + this employee's allowed schools intersect to" using data
-- it already has (SCHOOL_TABS config + fetchV2Branches()), so this function
-- doesn't need to know about SCHOOL_TABS/BRANCH_TO_FILTER naming at all.
--
-- total_families/total_children/total_with_transfer/total_without_transfer
-- are computed against the FULL matched set (before pagination), not just
-- the current page — so the "Заявки"/"Справочник" summary tiles in
-- FamiliesPage.tsx can read them directly instead of separately fetching and
-- summing the entire filtered result just to show 4 numbers.
--
-- Safe to run multiple times in Supabase SQL Editor (create or replace).

create or replace function public.get_families_page(
  p_branch_ids uuid[] default null,             -- null = no branch restriction
  p_search text default null,                    -- matches parent_name/phone/second_phone/any child_name
  p_child_status text default null,              -- 'new' | 'waiting' | 'boarded' | 'rejected' | 'paused'
  p_has_transfer boolean default null,           -- true = only children with a transfer, false = only without
  p_transfer_number int default null,
  p_exclude_rejected_children boolean default false,  -- logisticsWorkRows() parity: drop families with no non-rejected child
  p_limit int default 100,                       -- page size in FAMILIES
  p_offset int default 0
)
returns table (
  total_families bigint,
  total_children bigint,
  total_with_transfer bigint,
  total_without_transfer bigint,
  family_id text,
  family_created_at timestamptz,
  parent_name text,
  phone text,
  second_phone text,
  contact_name text,
  contact_phone text,
  child_id uuid,
  child_name text,
  class_name text,
  child_status text,
  school_id uuid,
  branch_id uuid,
  branch_code text,
  branch_short text,
  branch_name text,
  address text,
  distance_km numeric,
  zone text,
  vehicle_type text,
  base_price numeric,
  final_price numeric,
  stop_order int,
  time_morning time,
  self_exit_allowed boolean,
  latitude double precision,
  longitude double precision,
  transfer_number int,
  driver_id uuid,
  total_charged numeric,
  total_paid numeric,
  debt_amount numeric,
  paid_count int,
  confirmed_amount numeric,
  pending_amount numeric,
  pending_count int,
  rejected_count int,
  rejected_amount numeric,
  main_balance numeric,
  pending_payment_id uuid,
  pending_payment_amount numeric,
  pending_payment_date date,
  pending_actual_payment_date date,
  pending_payment_method text,
  pending_payment_receipt_url text,
  pending_payment_comment text
)
language sql
stable
as $$
  with matched_family_ids as (
    select f.id, f.parent_name, f.phone, f.second_phone, f.contact_name, f.contact_phone, f.created_at
    from public.v2_families f
    where
      (p_search is null or p_search = '' or
        f.parent_name ilike '%' || p_search || '%' or
        f.phone ilike '%' || p_search || '%' or
        f.second_phone ilike '%' || p_search || '%' or
        exists (
          select 1 from public.v2_children cc
          where cc.family_id = f.id and cc.child_name ilike '%' || p_search || '%'
        ))
      and (p_branch_ids is null or exists (
        select 1 from public.v2_children cc
        where cc.family_id = f.id and cc.branch_id = any(p_branch_ids)
      ))
      and (p_child_status is null or exists (
        select 1 from public.v2_children cc
        where cc.family_id = f.id and cc.status = p_child_status
      ))
      and (p_transfer_number is null or exists (
        select 1 from public.v2_children cc
        join public.v2_transfers t on t.id = cc.transfer_id
        where cc.family_id = f.id and t.transfer_number = p_transfer_number
      ))
      and (p_has_transfer is null or exists (
        select 1 from public.v2_children cc
        where cc.family_id = f.id and (cc.transfer_id is not null) = p_has_transfer
      ))
      and (not p_exclude_rejected_children or exists (
        select 1 from public.v2_children cc
        where cc.family_id = f.id and cc.status <> 'rejected'
      ))
  ),
  -- Same per-child filters as the main JOIN below, evaluated once over the
  -- FULL matched family set (not just the current page) to produce accurate
  -- totals for the summary tiles.
  matched_children as (
    select c.id, c.transfer_id
    from public.v2_children c
    join matched_family_ids mfi on mfi.id = c.family_id
    where (not p_exclude_rejected_children or c.status <> 'rejected')
      and (p_branch_ids is null or c.branch_id = any(p_branch_ids))
      and (p_child_status is null or c.status = p_child_status)
      and (p_has_transfer is null or (c.transfer_id is not null) = p_has_transfer)
      and (p_transfer_number is null or c.transfer_id in (
        select id from public.v2_transfers where transfer_number = p_transfer_number
      ))
  ),
  totals as (
    select
      (select count(*) from matched_family_ids) as total_families,
      (select count(*) from matched_children) as total_children,
      (select count(*) from matched_children where transfer_id is not null) as total_with_transfer,
      (select count(*) from matched_children where transfer_id is null) as total_without_transfer
  ),
  matched_families as (
    select mfi.*, t.total_families, t.total_children, t.total_with_transfer, t.total_without_transfer
    from matched_family_ids mfi
    cross join totals t
    order by mfi.created_at desc
    limit p_limit offset p_offset
  )
  select
    mf.total_families,
    mf.total_children,
    mf.total_with_transfer,
    mf.total_without_transfer,
    mf.id as family_id,
    mf.created_at as family_created_at,
    mf.parent_name, mf.phone, mf.second_phone, mf.contact_name, mf.contact_phone,
    c.id as child_id, c.child_name, c.class_name, c.status as child_status,
    c.school_id, c.branch_id,
    b.code as branch_code, b.short_name as branch_short, b.name as branch_name,
    c.address, c.distance_km, c.zone, c.vehicle_type, c.base_price, c.final_price,
    c.stop_order, c.time_morning, c.self_exit_allowed, c.latitude, c.longitude,
    tr.transfer_number, tr.driver_id,
    coalesce(s.total_charged, 0) as total_charged,
    coalesce(s.total_paid, 0) as total_paid,
    coalesce(s.debt_amount, 0) as debt_amount,
    coalesce(s.paid_count, 0) as paid_count,
    coalesce(s.confirmed_amount, 0) as confirmed_amount,
    coalesce(s.pending_amount, 0) as pending_amount,
    coalesce(s.pending_count, 0) as pending_count,
    coalesce(s.rejected_count, 0) as rejected_count,
    coalesce(s.rejected_amount, 0) as rejected_amount,
    coalesce(w.main_balance, 0) as main_balance,
    pp.id as pending_payment_id,
    pp.amount as pending_payment_amount,
    pp.payment_date as pending_payment_date,
    pp.actual_payment_date as pending_actual_payment_date,
    pp.payment_method as pending_payment_method,
    pp.receipt_url as pending_payment_receipt_url,
    pp.comment as pending_payment_comment
  from matched_families mf
  left join public.v2_children c
    on c.family_id = mf.id
    and (not p_exclude_rejected_children or c.status <> 'rejected')
    -- matched_family_ids above finds families that HAVE a qualifying child for
    -- p_branch_ids/p_child_status/p_transfer_number/p_has_transfer — but once
    -- a family matches, only the children that themselves satisfy those same
    -- filters should render (a sibling in a different school/status/transfer
    -- must not tag along). p_search is the one exception: a search match
    -- returns the whole family, every child, regardless of branch/status.
    and (p_branch_ids is null or c.branch_id = any(p_branch_ids))
    and (p_child_status is null or c.status = p_child_status)
    and (p_has_transfer is null or (c.transfer_id is not null) = p_has_transfer)
    and (p_transfer_number is null or c.transfer_id in (
      select id from public.v2_transfers where transfer_number = p_transfer_number
    ))
  left join public.v2_school_branches b on b.id = c.branch_id
  left join public.v2_transfers tr on tr.id = c.transfer_id
  left join public.v2_families_summary s on s.family_id = mf.id
  left join public.v2_family_wallets w on w.family_id = mf.id
  left join lateral (
    select p.id, p.amount, p.payment_date, p.actual_payment_date, p.payment_method, p.receipt_url, p.comment
    from public.v2_payments p
    where p.family_id = mf.id and p.status = 'pending'
    order by p.created_at asc
    limit 1
  ) pp on true
  order by mf.created_at desc, c.id;
$$;

grant execute on function public.get_families_page to anon, authenticated;

-- search/filter helper indexes — without these, p_search and the per-family
-- EXISTS checks above seq-scan v2_children on every call at 3000+ rows.
-- pg_trgm must exist before the gin_trgm_ops indexes below.
create extension if not exists pg_trgm;

create index if not exists idx_v2_children_child_name_trgm
  on public.v2_children using gin (child_name gin_trgm_ops);
create index if not exists idx_v2_families_parent_name_trgm
  on public.v2_families using gin (parent_name gin_trgm_ops);
create index if not exists idx_v2_payments_family_status_created
  on public.v2_payments(family_id, status, created_at);
