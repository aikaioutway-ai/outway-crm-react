-- Child statuses only:
-- new      = Новый
-- waiting  = Ожидание
-- boarded  = Посажен
-- rejected = Отказ
-- paused   = Пауза

update public.v2_children
set status = case
  when status = 'active' then 'boarded'
  when status in ('inactive', 'archive') then 'paused'
  when status in ('new', 'waiting', 'boarded', 'rejected', 'paused') then status
  else 'new'
end;

alter table public.v2_children
drop constraint if exists v2_children_status_check;

alter table public.v2_children
add constraint v2_children_status_check
check (status in ('new', 'waiting', 'boarded', 'rejected', 'paused'));
