-- Temporary drivers are normal editable driver cards. Renaming keeps payroll IDs.
create sequence public.v2_temporary_driver_number_seq;
select setval('public.v2_temporary_driver_number_seq', greatest(1, coalesce(
  (select max(substring(full_name from '^Временный водитель №([0-9]+)$')::bigint)
   from public.v2_drivers where full_name ~ '^Временный водитель №[0-9]+$'), 0) + 1), false);

create function public.ensure_v2_temporary_transfer_driver(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.v2_transfers%rowtype;
  new_driver_id uuid;
  driver_number bigint;
begin
  if p_transfer_id is null then return; end if;
  -- Serialize assignment per transfer to avoid duplicate cards from concurrent children.
  select * into target from public.v2_transfers where id = p_transfer_id for update;
  if not found or target.driver_id is not null or target.status = 'archive' then return; end if;
  if not exists (select 1 from public.v2_children where transfer_id = p_transfer_id and status <> 'rejected') then return; end if;
  driver_number := nextval('public.v2_temporary_driver_number_seq');
  insert into public.v2_drivers (full_name, phone, status, comment)
  values ('Временный водитель №' || driver_number, '', 'active', 'Временная карточка: заполните данные назначенного водителя.')
  returning id into new_driver_id;
  update public.v2_transfers set driver_id = new_driver_id, vehicle_id = null, updated_at = now()
  where id = p_transfer_id;
end;
$$;
revoke all on function public.ensure_v2_temporary_transfer_driver(uuid) from public, anon, authenticated;
revoke all on sequence public.v2_temporary_driver_number_seq from public, anon, authenticated;

create function public.v2_temporary_driver_after_child_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform public.ensure_v2_temporary_transfer_driver(new.transfer_id);
  return new;
end;
$$;
revoke all on function public.v2_temporary_driver_after_child_change() from public, anon, authenticated;
create trigger v2_temporary_driver_after_child_change
  after insert or update of transfer_id, status on public.v2_children
  for each row execute function public.v2_temporary_driver_after_child_change();

create function public.v2_temporary_driver_after_transfer_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.driver_id is null and new.status <> 'archive' then
    perform public.ensure_v2_temporary_transfer_driver(new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.v2_temporary_driver_after_transfer_change() from public, anon, authenticated;
create trigger v2_temporary_driver_after_transfer_change
  after insert or update of driver_id, status on public.v2_transfers
  for each row execute function public.v2_temporary_driver_after_transfer_change();

-- Populate existing occupied transfers in a stable school/transfer order.
do $$
declare target_id uuid;
begin
  for target_id in
    select t.id from public.v2_transfers t
    left join public.v2_school_branches b on b.id = t.branch_id
    where t.driver_id is null and t.status <> 'archive'
      and exists (select 1 from public.v2_children c where c.transfer_id = t.id and c.status <> 'rejected')
    order by b.short_name, t.transfer_number, t.id
  loop
    perform public.ensure_v2_temporary_transfer_driver(target_id);
  end loop;
end;
$$;
