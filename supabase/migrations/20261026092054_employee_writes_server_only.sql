-- Deploy employee-api and the matching client before applying this migration.
-- Custom employee sessions are verified by employee-api; direct browser writes bypass roles.
revoke insert, update, delete, truncate on public.v2_employees from public, anon, authenticated;
do $$
declare columns text;
begin
  select string_agg(quote_ident(column_name), ', ') into columns
    from information_schema.columns where table_schema='public' and table_name='v2_employees';
  execute format('revoke insert (%s), update (%s) on public.v2_employees from public, anon, authenticated', columns, columns);
end;
$$;
grant select, insert, update, delete on public.v2_employees to service_role;
