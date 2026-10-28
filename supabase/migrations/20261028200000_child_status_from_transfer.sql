-- Статус ребёнка больше не выбирается вручную — он следует из трансфера
-- (решение владельца 2026-10-28):
--   номер 1–15     → 'boarded'  (ездит)
--   нет трансфера  → 'new'      (не ездит)
--   Х              → 'rejected' (отказ, ни в каких подсчётах)
-- 'waiting' и 'paused' больше не используются.
--
-- Статус на деньги не влияет: автоначисление при посадке выключено
-- (20261020200000_pause_auto_charges.sql), начисления ставятся вручную.
-- Скидка 5% считает 'new' и 'boarded' одинаково.
--
-- Расширяет триггер трансфера Х (20261028180000_rejected_children_transfer_x.sql).
-- Откат: заново выполнить функцию из 20261028180000 (без последнего блока).

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
    new.status := case when new.transfer_id is null then 'new' else 'boarded' end;
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

-- Привести существующих детей к трансферу, с записью в историю карточки.
insert into public.v2_audit_log (actor_name, action, entity_type, entity_id, old_value, new_value, comment)
select
  'CRM',
  'status_change',
  'child',
  c.family_id,
  jsonb_build_object('child_id', c.id, 'child_name', c.child_name, 'status', c.status),
  jsonb_build_object('child_id', c.id, 'child_name', c.child_name,
    'status', case when c.transfer_id is null then 'new' else 'boarded' end),
  'Статус заменён трансфером'
from public.v2_children c
where c.status <> 'rejected'
  and c.status is distinct from case when c.transfer_id is null then 'new' else 'boarded' end;

update public.v2_children c
set status = case when c.transfer_id is null then 'new' else 'boarded' end
where c.status <> 'rejected'
  and c.status is distinct from case when c.transfer_id is null then 'new' else 'boarded' end;
