-- Трансфер «Х» (решение владельца 2026-10-28).
--
-- Отказ = трансфер Х. Ребёнок со статусом 'rejected' не занимает номер
-- 1–15: при переводе в отказ (любым способом — карточка, таблица, массово,
-- отказ семьи, мобильная версия) он снимается со своего трансфера, а в
-- историю карточки семьи пишется «Отправлен в трансфер Х (был №N)» с датой
-- и автором. Пока статус 'rejected', номер трансфера ему не поставить.
--
-- Автор берётся из заголовка запроса x-crm-employee (id сотрудника, его
-- ставит клиент CRM); если заголовка нет — «CRM».
--
-- Существующие отказники (на 2026-10-28 — 276, из них 115 с номером)
-- переносятся в Х. История для них: дата и автор из записи об отказе семьи,
-- иначе — дата последнего изменения ребёнка и «Автор неизвестен».
--
-- Откат: drop trigger apply_v2_child_rejected_to_transfer_x on public.v2_children;
--        drop function public.v2_child_rejected_to_transfer_x();
-- (снятые номера трансферов сохранены в v2_audit_log, action = 'transfer_x',
--  old_value ->> 'transfer_number').

create or replace function public.v2_child_rejected_to_transfer_x()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_previous int;
  v_employee text;
  v_actor text;
begin
  if new.status is distinct from 'rejected' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'rejected' then
    new.transfer_id := null;
    new.transfer_assigned_at := null;
    return new;
  end if;

  select t.transfer_number into v_previous
  from public.v2_transfers t
  where t.id = case when tg_op = 'UPDATE' then old.transfer_id else new.transfer_id end;

  new.transfer_id := null;
  new.transfer_assigned_at := null;

  begin
    v_employee := nullif(current_setting('request.headers', true)::json ->> 'x-crm-employee', '');
  exception when others then
    v_employee := null;
  end;
  if v_employee is not null then
    select e.full_name into v_actor from public.v2_employees e where e.id = v_employee;
  end if;

  insert into public.v2_audit_log (actor_name, action, entity_type, entity_id, old_value, new_value, comment)
  values (
    coalesce(v_actor, 'CRM'),
    'transfer_x',
    'child',
    new.family_id,
    jsonb_build_object('child_id', new.id, 'child_name', new.child_name, 'transfer_number', v_previous),
    jsonb_build_object('child_id', new.id, 'child_name', new.child_name, 'transfer', 'Х'),
    'Отправлен в трансфер Х' || coalesce(' (был №' || v_previous || ')', '')
  );
  return new;
end;
$$;

drop trigger if exists apply_v2_child_rejected_to_transfer_x on public.v2_children;
create trigger apply_v2_child_rejected_to_transfer_x
  before insert or update of status, transfer_id on public.v2_children
  for each row execute function public.v2_child_rejected_to_transfer_x();

-- Перенос уже отказавшихся детей в Х с записью в историю.
with family_reject as (
  select distinct on (entity_id) entity_id, created_at, actor_name
  from public.v2_audit_log
  where action = 'reject' and entity_type = 'family_status'
  order by entity_id, created_at desc
)
insert into public.v2_audit_log (actor_name, action, entity_type, entity_id, old_value, new_value, comment, created_at)
select
  coalesce(fr.actor_name, 'Автор неизвестен'),
  'transfer_x',
  'child',
  c.family_id,
  jsonb_build_object('child_id', c.id, 'child_name', c.child_name, 'transfer_number', t.transfer_number),
  jsonb_build_object('child_id', c.id, 'child_name', c.child_name, 'transfer', 'Х', 'backfill', true),
  'Отправлен в трансфер Х' || coalesce(' (был №' || t.transfer_number || ')', ''),
  coalesce(fr.created_at, c.updated_at, c.created_at)
from public.v2_children c
left join public.v2_transfers t on t.id = c.transfer_id
left join family_reject fr on fr.entity_id = c.family_id
where c.status = 'rejected'
  and not exists (
    select 1 from public.v2_audit_log l
    where l.action = 'transfer_x' and l.new_value ->> 'child_id' = c.id::text
  );

update public.v2_children
set transfer_id = null
where status = 'rejected' and transfer_id is not null;
