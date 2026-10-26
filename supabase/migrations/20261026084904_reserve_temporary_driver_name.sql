-- Prepared only. Reuse the same sequence as automatic transfer driver cards.
-- Opening/cancelling a form may leave gaps; allocated numbers must not be reused.
create function public.reserve_v2_temporary_driver_name()
returns text
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select 'Временный водитель №' || nextval('public.v2_temporary_driver_number_seq');
$$;
revoke all on function public.reserve_v2_temporary_driver_name() from public, anon, authenticated;
grant execute on function public.reserve_v2_temporary_driver_name() to service_role;
