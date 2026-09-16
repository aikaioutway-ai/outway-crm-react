-- Упрощённый рейс: старт, приём Live Location, завершение.
-- Дети и остановки больше не участвуют в запуске или ведении рейса.

create or replace function public.v2_start_transfer_run(
  p_transfer_id uuid,
  p_driver_id uuid,
  p_direction text,
  p_confirmed_by bigint
)
returns table (
  run_id uuid,
  created boolean,
  run_status text,
  run_direction text,
  stop_count int,
  next_stop_order int
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_transfer_driver_id uuid;
  v_transfer_status text;
  v_existing_status text;
  v_existing_direction text;
begin
  if p_direction not in ('morning', 'evening') then
    raise exception 'Invalid direction';
  end if;

  select t.driver_id, t.status
    into v_transfer_driver_id, v_transfer_status
  from public.v2_transfers t
  where t.id = p_transfer_id;

  if not found then
    raise exception 'Transfer not found';
  end if;
  if v_transfer_status <> 'active' then
    raise exception 'Transfer is not active';
  end if;
  if v_transfer_driver_id is distinct from p_driver_id then
    raise exception 'Driver is not assigned to this transfer';
  end if;
  if not exists (
    select 1
    from public.v2_drivers d
    where d.id = p_driver_id
      and d.status = 'active'
  ) then
    raise exception 'Assigned driver is not active';
  end if;

  -- Если рейс уже идёт, продолжаем его. Завершение выполняется только водителем.
  select r.id, r.status, r.direction
    into v_run_id, v_existing_status, v_existing_direction
  from public.v2_transfer_runs r
  where r.transfer_id = p_transfer_id
    and r.status = 'active'
  order by r.started_at desc
  limit 1;

  if v_run_id is not null then
    return query
      select v_run_id, false, v_existing_status, v_existing_direction, 0, null::int;
    return;
  end if;

  insert into public.v2_transfer_runs (
    transfer_id,
    driver_id,
    run_date,
    direction,
    status,
    started_at,
    next_stop_order,
    confirmed_by
  )
  values (
    p_transfer_id,
    p_driver_id,
    (now() at time zone 'Asia/Bishkek')::date,
    p_direction,
    'active',
    now(),
    null,
    p_confirmed_by
  )
  on conflict (transfer_id, run_date, direction) do nothing
  returning id into v_run_id;

  if v_run_id is null then
    select r.id, r.status
      into v_run_id, v_existing_status
    from public.v2_transfer_runs r
    where r.transfer_id = p_transfer_id
      and r.run_date = (now() at time zone 'Asia/Bishkek')::date
      and r.direction = p_direction;

    return query
      select v_run_id, false, v_existing_status, p_direction, 0, null::int;
    return;
  end if;

  return query
    select v_run_id, true, 'active'::text, p_direction, 0, null::int;
end;
$$;

create or replace function public.v2_finish_transfer_run(
  p_transfer_id uuid,
  p_driver_id uuid,
  p_confirmed_by bigint
)
returns table (
  run_id uuid,
  run_direction text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_direction text;
begin
  if not exists (
    select 1
    from public.v2_drivers d
    where d.id = p_driver_id
      and d.status = 'active'
  ) then
    raise exception 'Assigned driver is not active';
  end if;

  update public.v2_transfer_runs r
  set status = 'finished',
      finished_at = now(),
      confirmed_by = p_confirmed_by
  where r.transfer_id = p_transfer_id
    and r.driver_id = p_driver_id
    and r.status = 'active'
  returning r.id, r.direction into v_run_id, v_direction;

  if v_run_id is null then
    raise exception 'No active run to finish';
  end if;

  return query select v_run_id, v_direction;
end;
$$;

revoke all on function public.v2_start_transfer_run(uuid, uuid, text, bigint)
  from public, anon, authenticated;
revoke all on function public.v2_finish_transfer_run(uuid, uuid, bigint)
  from public, anon, authenticated;

grant execute on function public.v2_start_transfer_run(uuid, uuid, text, bigint)
  to service_role;
grant execute on function public.v2_finish_transfer_run(uuid, uuid, bigint)
  to service_role;

notify pgrst, 'reload schema';
