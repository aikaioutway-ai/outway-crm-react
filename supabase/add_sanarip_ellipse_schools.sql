-- Add Sanarip and Ellipse as new schools (they were missing from v2_schools /
-- v2_school_branches — present in the "Schools" reference sheet but never synced).
-- Light Academy Primary is handled separately in add_light_academy_primary_branch.sql.

begin;

insert into public.v2_schools(code, name)
values
  ('SANARIP', 'Международная школа Сан Арип'),
  ('ELLIPSE', 'Ellipse International School')
on conflict (code) do update set name = excluded.name, active = true;

with school_map as (
  select id, code from public.v2_schools where code in ('SANARIP', 'ELLIPSE')
)
insert into public.v2_school_branches(school_id, code, short_name, name, address, latitude, longitude, manager_phone)
select s.id, b.code, b.short_name, b.name, b.address, b.lat, b.lng, b.manager_phone
from (
  values
    ('SANARIP', 'SNP', 'SNP', 'Международная школа Сан Арип', 'ул. Динары Асановой, 3', 42.883686, 74.563906, '996555242924'),
    ('ELLIPSE', 'ELS', 'ELS', 'Ellipse International School', 'Городок Строителей, 9', 42.874073, 74.693092, '996999260894')
) as b(school_code, code, short_name, name, address, lat, lng, manager_phone)
join school_map s on s.code = b.school_code
on conflict (code) do update
set short_name = excluded.short_name,
    name = excluded.name,
    address = excluded.address,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    manager_phone = excluded.manager_phone,
    active = true;

commit;
