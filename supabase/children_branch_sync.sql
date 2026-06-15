-- OutWay CRM: move branch ownership toward children without redeploying the public form.
-- Run in Supabase SQL Editor.
--
-- Problem:
-- The current public form writes branch_name/school_code mainly to families.
-- CRM needs children to carry school/branch because seats are counted per child.
--
-- Solution:
-- 1. Add children.branch_name.
-- 2. Backfill existing children from their family.
-- 3. On new child insert/update, copy missing school_code/branch_name from families.
-- 4. On family school/branch update, sync children that are still empty.

alter table public.children
  add column if not exists branch_name text;

update public.children c
set
  branch_name = coalesce(nullif(c.branch_name, ''), f.branch_name),
  school_code = coalesce(nullif(c.school_code, ''), f.school_code)
from public.families f
where c.family_id = f.id
  and (
    c.branch_name is null
    or c.branch_name = ''
    or c.school_code is null
    or c.school_code = ''
  );

create or replace function public.fill_child_school_from_family()
returns trigger
language plpgsql
as $$
declare
  fam record;
begin
  select school_code, branch_name
    into fam
  from public.families
  where id = new.family_id;

  if new.school_code is null or new.school_code = '' then
    new.school_code := fam.school_code;
  end if;

  if new.branch_name is null or new.branch_name = '' then
    new.branch_name := fam.branch_name;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fill_child_school_from_family on public.children;
create trigger trg_fill_child_school_from_family
before insert or update of family_id, school_code, branch_name
on public.children
for each row
execute function public.fill_child_school_from_family();

create or replace function public.sync_children_school_from_family()
returns trigger
language plpgsql
as $$
begin
  update public.children
  set
    branch_name = case
      when branch_name is null or branch_name = '' or branch_name = old.branch_name then new.branch_name
      else branch_name
    end,
    school_code = case
      when school_code is null or school_code = '' or school_code = old.school_code then new.school_code
      else school_code
    end
  where family_id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_sync_children_school_from_family on public.families;
create trigger trg_sync_children_school_from_family
after update of school_code, branch_name
on public.families
for each row
execute function public.sync_children_school_from_family();
