-- Safely remove Kings from active CRM usage.
-- This keeps historical families/payments intact, but removes Kings from operational lists.

begin;

-- Preview affected records before the updates.
select
  (select count(*) from public.v2_schools where code = 'KNG' or name ilike '%Kings%') as schools,
  (select count(*) from public.v2_school_branches where code = 'KNG' or name ilike '%Kings%') as branches,
  (select count(*)
   from public.v2_children c
   join public.v2_school_branches b on b.id = c.branch_id
   where b.code = 'KNG' or b.name ilike '%Kings%') as children,
  (select count(*)
   from public.v2_transfers t
   join public.v2_school_branches b on b.id = t.branch_id
   where b.code = 'KNG' or b.name ilike '%Kings%') as transfers;

with kings_branches as (
  select id, school_id
  from public.v2_school_branches
  where code = 'KNG' or name ilike '%Kings%'
),
kings_schools as (
  select id
  from public.v2_schools
  where code = 'KNG'
     or name ilike '%Kings%'
     or id in (select school_id from kings_branches)
)
update public.v2_children
set
  status = case when status = 'rejected' then status else 'paused' end,
  transfer_id = null,
  updated_at = now()
where branch_id in (select id from kings_branches)
   or school_id in (select id from kings_schools);

with kings_branches as (
  select id, school_id
  from public.v2_school_branches
  where code = 'KNG' or name ilike '%Kings%'
),
kings_schools as (
  select id
  from public.v2_schools
  where code = 'KNG'
     or name ilike '%Kings%'
     or id in (select school_id from kings_branches)
)
update public.v2_transfers
set status = 'archive', updated_at = now()
where branch_id in (select id from kings_branches)
   or school_id in (select id from kings_schools);

with kings_branches as (
  select id, school_id
  from public.v2_school_branches
  where code = 'KNG' or name ilike '%Kings%'
),
kings_schools as (
  select id
  from public.v2_schools
  where code = 'KNG'
     or name ilike '%Kings%'
     or id in (select school_id from kings_branches)
)
update public.v2_tariffs
set active = false, active_to = current_date, updated_at = now()
where branch_id in (select id from kings_branches)
   or school_id in (select id from kings_schools);

update public.v2_school_branches
set active = false, updated_at = now()
where code = 'KNG' or name ilike '%Kings%';

update public.v2_schools
set active = false, updated_at = now()
where code = 'KNG' or name ilike '%Kings%';

commit;
