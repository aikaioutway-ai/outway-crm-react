-- «Справочник» менеджера: цифры по школам, плашки трансферов и поиск считает
-- база, чтобы браузер не скачивал всю таблицу семей ради нескольких чисел.
-- Правила подсчёта повторяют прежний расчёт в браузере (FamilyListRow):
--   * учитываются только дети активных филиалов;
--   * «посажены» = статус active/boarded, «отказ» = rejected;
--   * «новые» = статус не из известных рабочих (как mapChildStatus → 'new')
--     и у ребёнка нет номера трансфера;
--   * долг семьи (v2_families_summary.debt_amount) считается один раз на семью.
-- Функции только читают данные; откат — drop function.

create or replace function public.get_school_directory_stats()
returns table(
  branch_id uuid,
  branch_code text,
  branch_short text,
  branch_name text,
  applications bigint,
  new_requests bigint,
  boarded bigint,
  rejected bigint
)
language sql
stable
as $$
  select
    b.id,
    b.code,
    b.short_name,
    b.name,
    count(c.id),
    count(c.id) filter (
      where coalesce(c.status, '') not in ('active', 'boarded', 'inactive', 'archive', 'waiting', 'paused', 'rejected')
        and t.transfer_number is null
    ),
    count(c.id) filter (where c.status in ('active', 'boarded')),
    count(c.id) filter (where c.status = 'rejected')
  from public.v2_school_branches b
  left join public.v2_children c on c.branch_id = b.id
  left join public.v2_transfers t on t.id = c.transfer_id
  where b.active
  group by b.id, b.code, b.short_name, b.name;
$$;

create or replace function public.get_school_transfer_stats(p_branch_ids uuid[])
returns table(
  group_key text,
  children bigint,
  debt_sum numeric
)
language sql
stable
as $$
  with school_children as (
    select
      c.family_id,
      c.status,
      t.transfer_number,
      coalesce(c.status, '') not in ('active', 'boarded', 'inactive', 'archive', 'waiting', 'paused', 'rejected')
        and t.transfer_number is null as is_new_unassigned
    from public.v2_children c
    join public.v2_school_branches b on b.id = c.branch_id and b.active
    left join public.v2_transfers t on t.id = c.transfer_id
    where c.branch_id = any(p_branch_ids)
  ),
  grouped as (
    select transfer_number::text as group_key, family_id
    from school_children
    where status is distinct from 'rejected' and transfer_number is not null
    union all
    select 'new', family_id from school_children where is_new_unassigned
    union all
    select 'rejected', family_id from school_children where status = 'rejected'
    union all
    select 'all', family_id from school_children where status is distinct from 'rejected'
  ),
  family_debt as (
    select distinct g.group_key, g.family_id, greatest(coalesce(s.debt_amount, 0), 0) as debt
    from grouped g
    left join public.v2_families_summary s on s.family_id = g.family_id
  )
  select
    g.group_key,
    count(*),
    (select coalesce(sum(fd.debt), 0) from family_debt fd where fd.group_key = g.group_key)
  from grouped g
  group by g.group_key;
$$;

-- Поиск ребёнка/семьи для подсказок менеджера: подстрока в «родитель ребёнок»
-- (p_text, уже в нижнем регистре) или цифры телефона без 996/0 (p_digits).
create or replace function public.search_family_children(p_text text, p_digits text, p_limit integer default 50)
returns table(
  family_id text,
  parent_name text,
  phone text,
  second_phone text,
  child_id uuid,
  child_name text,
  child_status text,
  branch_code text,
  branch_name text,
  transfer_number integer
)
language sql
stable
as $$
  with normalized as (
    select
      f.id,
      f.created_at,
      f.parent_name,
      f.phone,
      f.second_phone,
      regexp_replace(regexp_replace(regexp_replace(coalesce(f.phone, ''), '\D', '', 'g'), '^996', ''), '^0', '') as phone_digits,
      regexp_replace(regexp_replace(regexp_replace(coalesce(f.second_phone, ''), '\D', '', 'g'), '^996', ''), '^0', '') as second_phone_digits
    from public.v2_families f
  )
  select
    n.id::text,
    n.parent_name,
    n.phone,
    n.second_phone,
    c.id,
    c.child_name,
    c.status,
    b.code,
    b.name,
    t.transfer_number
  from normalized n
  join public.v2_children c on c.family_id = n.id
  join public.v2_school_branches b on b.id = c.branch_id and b.active
  left join public.v2_transfers t on t.id = c.transfer_id
  where (
      length(coalesce(p_text, '')) >= 2
      and position(p_text in lower(coalesce(n.parent_name, '') || ' ' || coalesce(c.child_name, ''))) > 0
    ) or (
      length(coalesce(p_digits, '')) >= 3
      and (position(p_digits in n.phone_digits) > 0 or position(p_digits in n.second_phone_digits) > 0)
    )
  order by n.created_at desc, c.created_at, c.id
  limit greatest(coalesce(p_limit, 50), 1);
$$;

grant execute on function public.get_school_directory_stats() to anon, authenticated;
grant execute on function public.get_school_transfer_stats(uuid[]) to anon, authenticated;
grant execute on function public.search_family_children(text, text, integer) to anon, authenticated;
