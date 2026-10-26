-- Prepared only: apply to production separately after approval.
-- Names are snapshots, so renaming/deleting a driver does not rewrite history.
create table public.v2_transfer_driver_history (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null,
  previous_driver_id uuid,
  driver_id uuid,
  previous_driver_name text,
  driver_name text,
  event_type text not null check (event_type in ('initial', 'change')),
  recorded_at timestamptz not null default clock_timestamp(),
  check (event_type = 'initial' or previous_driver_id is distinct from driver_id)
);

create index v2_transfer_driver_history_transfer_date_idx
  on public.v2_transfer_driver_history (transfer_id, recorded_at desc, id);

alter table public.v2_transfer_driver_history enable row level security;
revoke all on public.v2_transfer_driver_history from public, anon, authenticated;
grant select on public.v2_transfer_driver_history to service_role;

-- Only triggers write this journal. Employee access is checked by the server API.
create function public.record_v2_transfer_driver_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_id uuid;
  previous_name text;
  current_name text;
begin
  if tg_op = 'UPDATE' then
    if old.driver_id is not distinct from new.driver_id then return new; end if;
    previous_id := old.driver_id;
  elsif new.driver_id is null then
    return new;
  end if;

  select full_name into previous_name from public.v2_drivers where id = previous_id;
  select full_name into current_name from public.v2_drivers where id = new.driver_id;
  insert into public.v2_transfer_driver_history
    (transfer_id, previous_driver_id, driver_id, previous_driver_name, driver_name, event_type)
  values
    (new.id, previous_id, new.driver_id, previous_name, current_name,
     case when tg_op = 'INSERT' then 'initial' else 'change' end);
  return new;
end;
$$;
revoke all on function public.record_v2_transfer_driver_change() from public, anon, authenticated;

create trigger v2_transfer_driver_history_after_change
  after insert or update of driver_id on public.v2_transfers
  for each row execute function public.record_v2_transfer_driver_change();

-- Record the observed starting state, without inventing dates of past assignments.
insert into public.v2_transfer_driver_history
  (transfer_id, driver_id, driver_name, event_type)
select t.id, t.driver_id, d.full_name, 'initial'
from public.v2_transfers t
left join public.v2_drivers d on d.id = t.driver_id
where t.driver_id is not null;
