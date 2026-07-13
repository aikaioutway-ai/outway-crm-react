-- OutWay CRM: add 2026-2027 schools and branches.
-- Safe to run repeatedly in the Supabase SQL Editor.

begin;

insert into public.v2_schools(code, name, active)
values
  ('KRT', 'Креатив-Таалим', true),
  ('ABL', 'Академия будущих лидеров', true),
  ('KLM', 'Калем Академи Скуул', true),
  ('TSL', 'Tesla Academy', true)
on conflict (code) do update
set name = excluded.name,
    active = excluded.active;

with branch_data(school_code, code, short_name, name, address, latitude, longitude, manager_phone) as (
  values
    ('KRT', 'KRT', 'KRT', 'Креатив-Таалим', 'ул. 7 Апреля, 156', 42.858703::double precision, 74.634108::double precision, '996999260894'),
    ('ABL', 'ABL1', 'ABL #1', 'Академия будущих лидеров (Авангард)', 'ул. Байтик баатыра, 4а/8', 42.84358275219382::double precision, 74.63115331300138::double precision, '996550242924'),
    ('ABL', 'ABL2', 'ABL #2', 'Академия будущих лидеров (Мавлянова)', 'ул. Жуная Мавлянова, 10', 42.8173419841855::double precision, 74.60383769639346::double precision, '996550242924'),
    ('KLM', 'KLM', 'KLM', 'Калем Академи Скуул', 'ул. Исы Ахунбаева, 201', 42.84388367480388::double precision, 74.57939299999965::double precision, '996555242924'),
    ('TSL', 'TSL', 'TSL', 'Tesla Academy', 'ул. 27-я линия, 13а', 42.842265::double precision, 74.558067::double precision, '996555242924')
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
where branches.code in ('KRT', 'ABL1', 'ABL2', 'KLM', 'TSL')
order by branches.code;
