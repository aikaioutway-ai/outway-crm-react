-- Трансфер «!» и «?» (решение владельца 2026-11-10).
--
-- Список трансферов у ребёнка: «—», 1…15, затем «!» (логист принял в работу),
-- «?» (ожидание) и «Х» (отказ). «!» и «?» — пометка у ребёнка без номера:
-- статус остаётся 'new', поэтому начисления, скидки и счётчики не меняются.
-- Пометка снимается сама, как только ребёнку дают номер или отправляют в Х.
--
-- Комментарий к переводу в «?», «Х» и к возврату из «Х» хранится у ребёнка
-- (последний) и в истории карточки семьи. Автора и время ставит база:
-- автор — сотрудник из заголовка x-crm-employee, иначе «CRM».

alter table public.v2_children
  add column if not exists transfer_mark text,
  add column if not exists transfer_comment text,
  add column if not exists transfer_comment_by text,
  add column if not exists transfer_comment_at timestamptz;

alter table public.v2_children
  drop constraint if exists v2_children_transfer_mark_check;
alter table public.v2_children
  add constraint v2_children_transfer_mark_check check (transfer_mark is null or transfer_mark in ('in_work', 'waiting'));

create or replace function public.v2_child_transfer_mark_and_comment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_employee text;
  v_actor text;
  v_target text;
  v_number int;
begin
  -- Пометка «!» / «?» живёт только у ребёнка без номера и не в отказе.
  if new.transfer_id is not null or new.status is distinct from 'new' then
    new.transfer_mark := null;
  end if;

  if new.transfer_comment is not null and (tg_op = 'INSERT'
      or new.transfer_comment_at is distinct from old.transfer_comment_at
      or new.transfer_comment is distinct from old.transfer_comment) then
    begin
      v_employee := nullif(current_setting('request.headers', true)::json ->> 'x-crm-employee', '');
    exception when others then
      v_employee := null;
    end;
    if v_employee is not null then
      select e.full_name into v_actor from public.v2_employees e where e.id = v_employee;
    end if;
    new.transfer_comment_by := coalesce(v_actor, 'CRM');
    new.transfer_comment_at := now();

    if new.status = 'rejected' then
      v_target := 'Отправлен в трансфер Х';
    elsif tg_op = 'UPDATE' and old.status = 'rejected' then
      v_target := 'Возвращён из трансфера Х';
    elsif new.transfer_mark = 'waiting' then
      v_target := 'Трансфер «?» — ожидание';
    elsif new.transfer_mark = 'in_work' then
      v_target := 'Трансфер «!» — принят в работу';
    elsif new.transfer_id is not null then
      select t.transfer_number into v_number from public.v2_transfers t where t.id = new.transfer_id;
      v_target := 'Трансфер №' || coalesce(v_number::text, '?');
    else
      v_target := 'Без трансфера';
    end if;

    insert into public.v2_audit_log (actor_name, action, entity_type, entity_id, old_value, new_value, comment)
    values (
      new.transfer_comment_by,
      'transfer_comment',
      'child',
      new.family_id,
      jsonb_build_object('child_id', new.id, 'child_name', new.child_name),
      jsonb_build_object('child_id', new.id, 'child_name', new.child_name, 'target', v_target),
      v_target || ': ' || new.transfer_comment
    );
  end if;
  return new;
end;
$$;

drop trigger if exists apply_v2_child_transfer_mark_and_comment on public.v2_children;
create trigger apply_v2_child_transfer_mark_and_comment
  before insert or update on public.v2_children
  for each row execute function public.v2_child_transfer_mark_and_comment();
