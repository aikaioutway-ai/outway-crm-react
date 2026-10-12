-- Автоначисление 1 октября упало с «UPDATE requires a WHERE clause»:
-- запросы через PostgREST идут с pg_safeupdate, а v2_refresh_child_prices
-- обновлял всех детей без WHERE. Явный WHERE true снимает блокировку.

create or replace function public.v2_refresh_child_prices()
returns void
language sql
security definer
set search_path = public
as $$
  update public.v2_children set final_price = final_price where true;
$$;

revoke all on function public.v2_refresh_child_prices() from public, anon, authenticated;
grant execute on function public.v2_refresh_child_prices() to service_role;
