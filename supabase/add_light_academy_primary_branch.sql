-- Light Academy Primary is a separate branch of the existing Light Academy
-- (LIGHT/LA) school — add it as its own v2_school_branches row so it shows
-- up as its own tab (LA_P) in the CRM instead of collapsing into LA.

begin;

with school_map as (
  select id from public.v2_schools where code = 'LA'
)
insert into public.v2_school_branches(school_id, code, short_name, name, address, latitude, longitude, manager_phone)
select id, 'LA_P', 'LA_P', 'Light Academy Primary', 'ул. Сухэ-Батора, 11/2', 42.82721280856116, 74.62455709590789, '996506242924'
from school_map
on conflict (code) do update
set short_name = excluded.short_name,
    name = excluded.name,
    address = excluded.address,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    manager_phone = excluded.manager_phone,
    active = true;

commit;
