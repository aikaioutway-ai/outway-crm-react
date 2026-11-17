-- Сигнал «эти семьи изменились» для открытых CRM через Realtime Broadcast.
-- Раньше каждая вкладка слушала postgres_changes по v2_children и v2_transfers:
-- Realtime ради этого опрашивает WAL примерно раз в секунду (≈65% времени базы),
-- а по каждому событию CRM заново выкачивала всю таблицу семей.
-- Теперь база сама шлёт один короткий сигнал на оператор (а не на строку):
-- { family_ids: [...] } или { all: true }, если семей слишком много.
-- Сбой рассылки никогда не мешает самой записи.

create or replace function public.v2_broadcast_family_ids(p_family_ids text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids text[] := array(select distinct x from unnest(p_family_ids) x where x is not null);
begin
  if coalesce(array_length(v_ids, 1), 0) = 0 then return; end if;
  begin
    perform realtime.send(
      case when array_length(v_ids, 1) > 200 then jsonb_build_object('all', true)
           else jsonb_build_object('family_ids', to_jsonb(v_ids)) end,
      'changed',
      'crm-family-changes',
      false
    );
  exception when others then
    raise warning 'crm-family-changes broadcast failed: %', sqlerrm;
  end;
end;
$$;

revoke all on function public.v2_broadcast_family_ids(text[]) from public, anon, authenticated;

-- Дети: семья берётся прямо из строки (до и после изменения — ребёнка могли перенести в другую семью).
create or replace function public.v2_children_broadcast_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.v2_broadcast_family_ids(array(select family_id::text from new_rows));
  elsif tg_op = 'UPDATE' then
    perform public.v2_broadcast_family_ids(array(select family_id::text from new_rows union select family_id::text from old_rows));
  else
    perform public.v2_broadcast_family_ids(array(select family_id::text from old_rows));
  end if;
  return null;
end;
$$;

-- Трансферы: номер, водитель и тип машины видны в строках всех детей этого трансфера.
create or replace function public.v2_transfers_broadcast_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    return null; -- у нового трансфера ещё нет детей
  elsif tg_op = 'UPDATE' then
    perform public.v2_broadcast_family_ids(array(
      select c.family_id::text from public.v2_children c where c.transfer_id in (select id from new_rows)
    ));
  else
    perform public.v2_broadcast_family_ids(array(
      select c.family_id::text from public.v2_children c where c.transfer_id in (select id from old_rows)
    ));
  end if;
  return null;
end;
$$;

revoke all on function public.v2_children_broadcast_changes() from public, anon, authenticated;
revoke all on function public.v2_transfers_broadcast_changes() from public, anon, authenticated;

-- Таблицы переходов разрешены только для триггера на одно событие, поэтому по три триггера.
drop trigger if exists v2_children_broadcast_insert on public.v2_children;
drop trigger if exists v2_children_broadcast_update on public.v2_children;
drop trigger if exists v2_children_broadcast_delete on public.v2_children;
create trigger v2_children_broadcast_insert after insert on public.v2_children
  referencing new table as new_rows for each statement execute function public.v2_children_broadcast_changes();
create trigger v2_children_broadcast_update after update on public.v2_children
  referencing old table as old_rows new table as new_rows for each statement execute function public.v2_children_broadcast_changes();
create trigger v2_children_broadcast_delete after delete on public.v2_children
  referencing old table as old_rows for each statement execute function public.v2_children_broadcast_changes();

drop trigger if exists v2_transfers_broadcast_update on public.v2_transfers;
drop trigger if exists v2_transfers_broadcast_delete on public.v2_transfers;
create trigger v2_transfers_broadcast_update after update on public.v2_transfers
  referencing old table as old_rows new table as new_rows for each statement execute function public.v2_transfers_broadcast_changes();
create trigger v2_transfers_broadcast_delete after delete on public.v2_transfers
  referencing old table as old_rows for each statement execute function public.v2_transfers_broadcast_changes();

-- Старую подписку postgres_changes (таблицы в публикации supabase_realtime) убираем
-- отдельной миграцией ПОСЛЕ выкатки нового фронтенда: до этого уже открытые вкладки
-- со старым кодом ещё слушают postgres_changes.
