-- OutWay CRM: guard against missing families.branch_name.
-- Run in Supabase SQL Editor.
--
-- This does not replace the public form / Apps Script fix.
-- It protects the database when branch_name is missing but school_code is enough
-- to infer the exact branch.
--
-- Ambiguous grouped codes are intentionally not guessed:
-- GENIUS can be Chuykova or Avangard City.
-- INDIGO can be Kids / AsylKech / Prime / West.
-- AES_KAS can be AES or KAS.

create or replace function public.infer_branch_name_from_school_code(p_school_code text)
returns text
language sql
immutable
as $$
  select case upper(nullif(trim(p_school_code), ''))
    when 'LIGHT' then 'Light Academy'
    when 'LA' then 'Light Academy'
    when 'BILIM' then 'Билим Бишкек Kg'
    when 'BKG' then 'Билим Бишкек Kg'
    when 'EPSILON' then 'Эпсилон'
    when 'EPS' then 'Эпсилон'
    when 'NOVA' then 'Nova International School'
    when 'ERUDIT' then 'Эрудит-ISIT'
    when 'ERU' then 'Эрудит-ISIT'
    when 'TENSAY' then 'Тенсай'
    when 'TENSAI' then 'Тенсай'
    when 'TIS' then 'Тенсай'
    when 'EDISON' then 'Edison'
    when 'EDI' then 'Edison'
    when 'AES' then 'American-European School'
    when 'KAS' then 'Kyrgyz-American School'
    when 'GENIUS4' then 'Гениум Авангард Сити'
    when 'GEN4' then 'Гениум Авангард Сити'
    when 'ING_P' then 'Indigo Prime Academy'
    when 'ING_W' then 'Indigo West'
    when 'ING_A' then 'AsylKech Girls School'
    else null
  end
$$;

update public.families
set branch_name = public.infer_branch_name_from_school_code(school_code)
where (branch_name is null or branch_name = '')
  and public.infer_branch_name_from_school_code(school_code) is not null;

create or replace function public.fill_family_branch_name()
returns trigger
language plpgsql
as $$
begin
  if new.branch_name is null or new.branch_name = '' then
    new.branch_name := public.infer_branch_name_from_school_code(new.school_code);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fill_family_branch_name on public.families;
create trigger trg_fill_family_branch_name
before insert or update of school_code, branch_name
on public.families
for each row
execute function public.fill_family_branch_name();

-- Show unresolved rows after the safe backfill.
select
  id,
  parent_name,
  phone,
  school_code,
  branch_name,
  created_at
from public.families
where branch_name is null or branch_name = ''
order by created_at desc;
