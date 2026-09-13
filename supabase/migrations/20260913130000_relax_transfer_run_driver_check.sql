-- Убираем требование "Telegram водителя уже подтверждён" при старте рейса:
-- теперь кнопку "Начать рейс" может нажать любой администратор группы,
-- водителю больше не нужно подтверждать номер телефона.

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
  v_stop_count int;
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

  select count(*)::int
    into v_stop_count
  from public.v2_children c
  where c.transfer_id = p_transfer_id;

  if v_stop_count = 0 then
    raise exception 'Transfer has no children';
  end if;
  if exists (
    select 1
    from public.v2_children c
    where c.transfer_id = p_transfer_id
      and (
        c.stop_order is null
        or c.latitude is null
        or c.longitude is null
      )
  ) then
    raise exception 'Every child must have coordinates and stop order';
  end if;
  if (
    select count(distinct c.stop_order)
    from public.v2_children c
    where c.transfer_id = p_transfer_id
  ) <> v_stop_count then
    raise exception 'Stop order must be unique within a transfer';
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
    1,
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
      select
        v_run_id,
        false,
        v_existing_status,
        p_direction,
        (
          select count(*)::int
          from public.v2_transfer_run_stops s
          where s.run_id = v_run_id
        ),
        (
          select r.next_stop_order
          from public.v2_transfer_runs r
          where r.id = v_run_id
        );
    return;
  end if;

  insert into public.v2_transfer_run_stops (
    run_id,
    child_id,
    child_name,
    address,
    latitude,
    longitude,
    source_stop_order,
    stop_order
  )
  select
    v_run_id,
    c.id,
    c.child_name,
    c.address,
    c.latitude,
    c.longitude,
    c.stop_order,
    row_number() over (
      order by
        case when p_direction = 'morning' then c.stop_order end asc,
        case when p_direction = 'evening' then c.stop_order end desc
    )::int
  from public.v2_children c
  where c.transfer_id = p_transfer_id;

  return query
    select v_run_id, true, 'active'::text, p_direction, v_stop_count, 1;
end;
$$;

revoke all on function public.v2_start_transfer_run(uuid, uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.v2_start_transfer_run(uuid, uuid, text, bigint)
  to service_role;
