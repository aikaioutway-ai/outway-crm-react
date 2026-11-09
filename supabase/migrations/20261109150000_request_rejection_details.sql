-- Отказ в канбане заявок = трансфер «Х» (status = 'rejected').
-- Храним причину, комментарий и дату отказа, а этап канбана держим
-- в согласии со статусом, как бы ребёнка ни отправили в отказ или ни вернули.

alter table public.v2_children
  add column if not exists reject_reason text,
  add column if not exists reject_comment text,
  add column if not exists rejected_at timestamptz;

create or replace function public.v2_child_sync_request_stage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'rejected' then
    if tg_op = 'INSERT' or old.status is distinct from 'rejected' then
      new.rejected_at := now();
    end if;
    new.request_stage := 'rejected';
    new.waiting_reason := null;
    new.waiting_comment := null;
  elsif tg_op = 'UPDATE' and old.status = 'rejected' then
    -- Вернули из отказа: заявка снова живая, причина отказа остаётся в истории.
    if new.request_stage = 'rejected' then
      new.request_stage := 'new';
    end if;
    new.reject_reason := null;
    new.reject_comment := null;
    new.rejected_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_v2_child_request_stage on public.v2_children;
create trigger sync_v2_child_request_stage
  before insert or update on public.v2_children
  for each row execute function public.v2_child_sync_request_stage();

-- Уже отказавшиеся: этап «Отказ» и дата отказа из истории (трансфер Х).
with last_x as (
  select distinct on (new_value ->> 'child_id') new_value ->> 'child_id' as child_id, created_at
  from public.v2_audit_log
  where action = 'transfer_x'
  order by new_value ->> 'child_id', created_at desc
)
update public.v2_children c
set request_stage = 'rejected',
    rejected_at = coalesce(x.created_at, c.updated_at, c.created_at)
from (select id from public.v2_children where status = 'rejected') r
left join last_x x on x.child_id = r.id::text
where c.id = r.id;

-- Вне отказа этап «Отказ» не нужен.
update public.v2_children
set request_stage = 'new'
where status is distinct from 'rejected' and request_stage = 'rejected';
