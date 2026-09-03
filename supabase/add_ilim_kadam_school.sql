-- OutWay CRM: add Ilim Kadam school and branch.
-- Safe to run repeatedly in the Supabase SQL Editor.

begin;

insert into public.v2_schools(code, name, active)
values
  ('Ilim_k', 'Илим Кадам', true)
on conflict (code) do update
set name = excluded.name,
    active = excluded.active;

with branch_data(school_code, code, short_name, name, address, latitude, longitude, manager_phone) as (
  values
    ('Ilim_k', 'Ilim_k', 'Ilim_k', 'Илим Кадам', 'ул. Карагула Акмата, 126', 42.808707::double precision, 74.647449::double precision, '996559242924')
)
insert into public.v2_school_branches(
  school_id, code, short_name, name, address,
  latitude, longitude, manager_phone, active
)
select
  schools.id, branch_data.code, branch_data.short_name, branch_data.name,
  branch_data.address, branch_data.latitude, branch_data.longitude,
  branch_data.manager_phone, true
from branch_data
join public.v2_schools as schools on schools.code = branch_data.school_code
on conflict (code) do update
set school_id = excluded.school_id,
    short_name = excluded.short_name,
    name = excluded.name,
    address = excluded.address,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    manager_phone = excluded.manager_phone,
    active = excluded.active;

commit;

select
  schools.code as school_code,
  schools.name as school_name,
  branches.code as branch_code,
  branches.short_name,
  branches.name as branch_name,
  branches.active
from public.v2_schools as schools
join public.v2_school_branches as branches on branches.school_id = schools.id
where branches.code in ('Ilim_k')
order by branches.code;
