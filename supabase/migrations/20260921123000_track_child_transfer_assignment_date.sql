-- Keep the latest transfer assignment date on each child. The value changes
-- only when transfer_id changes, so unrelated edits do not rewrite it.

alter table public.v2_children
  add column if not exists transfer_assigned_at timestamptz;

with latest_matching_transfer as (
  select distinct on (log.entity_id)
    log.entity_id,
    log.created_at
  from public.v2_audit_log log
  join public.v2_children child on child.id::text = log.entity_id
  where log.entity_type = 'child'
    and log.action = 'transfer_reprice'
    and child.transfer_id is not null
    and log.new_value ->> 'transfer_id' = child.transfer_id::text
  order by log.entity_id, log.created_at desc
)
update public.v2_children child
set transfer_assigned_at = coalesce(history.created_at, child.updated_at, child.created_at)
from latest_matching_transfer history
where child.id::text = history.entity_id
  and child.transfer_id is not null
  and child.transfer_assigned_at is null;

update public.v2_children
set transfer_assigned_at = coalesce(updated_at, created_at)
where transfer_id is not null
  and transfer_assigned_at is null;

create or replace function public.set_v2_child_transfer_assigned_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.transfer_id is not null and new.transfer_assigned_at is null then
      new.transfer_assigned_at := now();
    end if;
  elsif new.transfer_id is distinct from old.transfer_id then
    new.transfer_assigned_at := case when new.transfer_id is null then null else now() end;
  end if;
  return new;
end;
$$;

drop trigger if exists set_v2_child_transfer_assigned_at on public.v2_children;
create trigger set_v2_child_transfer_assigned_at
before insert or update of transfer_id on public.v2_children
for each row execute function public.set_v2_child_transfer_assigned_at();

comment on column public.v2_children.transfer_assigned_at is
  'Timestamp of the latest assignment or move to the current transfer.';
