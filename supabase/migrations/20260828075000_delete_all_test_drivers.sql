-- Все существующие на момент очистки водители и их автомобили были тестовыми.
do $$
declare
  driver_count integer;
  vehicle_count integer;
  detached_transfer_count integer;
  deleted_vehicle_count integer;
  deleted_driver_count integer;
begin
  select count(*) into driver_count from public.v2_drivers;
  select count(*) into vehicle_count from public.v2_vehicles where driver_id is not null;

  if driver_count <> 7 then
    raise exception 'Ожидалось 7 тестовых водителей, найдено %', driver_count;
  end if;
  if vehicle_count <> 5 then
    raise exception 'Ожидалось 5 автомобилей тестовых водителей, найдено %', vehicle_count;
  end if;

  delete from public.v2_payroll_payments where subject_type = 'driver';
  delete from public.v2_payroll_entries where subject_type = 'driver';

  update public.v2_transfers
  set driver_id = null, vehicle_id = null
  where driver_id is not null;
  get diagnostics detached_transfer_count = row_count;

  if detached_transfer_count <> 2 then
    raise exception 'Ожидалось 2 закреплённых трансфера, найдено %', detached_transfer_count;
  end if;

  delete from public.v2_vehicles where driver_id is not null;
  get diagnostics deleted_vehicle_count = row_count;

  delete from public.v2_drivers;
  get diagnostics deleted_driver_count = row_count;

  if deleted_vehicle_count <> 5 or deleted_driver_count <> 7 then
    raise exception 'Удалено автомобилей: %, водителей: %', deleted_vehicle_count, deleted_driver_count;
  end if;
end;
$$;
