-- История карточки: «кто / когда / было → стало» (решение владельца 2026-10-29).
--
-- 1. Индекс по entity_id: карточка ищет историю по номеру семьи, старый индекс
--    (entity_type, entity_id) для такого поиска не подходил.
-- 2. База сама записывает любое изменение ребёнка и семьи по полям — откуда бы
--    ни пришла правка (CRM, мобильная версия, бот, скрипт). Автор — сотрудник из
--    заголовка x-crm-employee (его ставит CRM), иначе app.actor, иначе «Система».
--    Начисления, скидки, платежи уже пишут свои записи в RPC — их не дублируем.
-- 3. get_family_history — вся история семьи одной лентой: записи семьи, её детей
--    и их начислений; служебный шум скрыт.
--
-- Откат:
--   drop trigger if exists v2_children_audit_changes on public.v2_children;
--   drop trigger if exists v2_families_audit_changes on public.v2_families;
--   drop function if exists public.v2_audit_row_changes();
--   drop function if exists public.v2_audit_actor();
--   drop function if exists public.get_family_history(text);
--   drop index if exists public.idx_v2_audit_log_entity_id;

create index if not exists idx_v2_audit_log_entity_id
  on public.v2_audit_log (entity_id, created_at desc);

create or replace function public.v2_audit_actor()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_employee text;
  v_name text;
begin
  begin
    v_employee := nullif(current_setting('request.headers', true)::json ->> 'x-crm-employee', '');
  exception when others then
    v_employee := null;
  end;
  if v_employee is not null then
    select e.full_name into v_name from public.v2_employees e where e.id = v_employee;
    if v_name is not null then return v_name; end if;
  end if;
  return coalesce(nullif(current_setting('app.actor', true), ''), 'Система');
end;
$$;

create or replace function public.v2_audit_row_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields text[];
  v_old jsonb;
  v_new jsonb;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_field text;
  v_family text;
  v_subject text;
begin
  if tg_table_name = 'v2_children' then
    -- Статус следует из трансфера, координаты — из адреса: их отдельно не пишем.
    v_fields := array['child_name','class_name','self_exit_allowed','branch_id','address','distance_km','zone',
      'vehicle_type','requested_vehicle_type','base_price','final_price','fixed_price','discount_override_percent',
      'manual_discount_percent','manual_discount_amount','discount_valid_from','discount_valid_to','discount_reason',
      'transfer_id','stop_order','time_morning','transfer_assigned_at'];
  else
    v_fields := array['parent_name','phone','phone_telegram','second_phone','second_phone_telegram',
      'contact_name','contact_phone','contact_phone_telegram','comment','status'];
  end if;

  if tg_op = 'INSERT' then
    if tg_table_name <> 'v2_children' then return null; end if;
    insert into public.v2_audit_log (actor_name, action, entity_type, entity_id, old_value, new_value, comment)
    values (public.v2_audit_actor(), 'create_child', 'child', new.family_id, null,
      jsonb_build_object('child_id', new.id, 'child_name', new.child_name,
        'branch_id', (select coalesce(b.short_name, b.code) from public.v2_school_branches b where b.id = new.branch_id),
        'transfer_id', (select t.transfer_number::text from public.v2_transfers t where t.id = new.transfer_id)),
      new.child_name);
    return null;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  foreach v_field in array v_fields loop
    if v_old -> v_field is distinct from v_new -> v_field then
      v_before := v_before || jsonb_build_object(v_field, v_old -> v_field);
      v_after := v_after || jsonb_build_object(v_field, v_new -> v_field);
    end if;
  end loop;

  if tg_table_name = 'v2_children' then
    -- Отказ пишет своя запись «Отправлен в трансфер Х»; дата посадки при пересадке меняется сама.
    if new.status = 'rejected' and old.status is distinct from 'rejected' then
      v_before := v_before - 'transfer_id' - 'transfer_assigned_at';
      v_after := v_after - 'transfer_id' - 'transfer_assigned_at';
    elsif v_after ? 'transfer_id' then
      v_before := v_before - 'transfer_assigned_at';
      v_after := v_after - 'transfer_assigned_at';
    end if;
    if v_after ? 'transfer_id' then
      v_before := jsonb_set(v_before, '{transfer_id}', coalesce(to_jsonb((select t.transfer_number::text from public.v2_transfers t where t.id = old.transfer_id)), 'null'::jsonb));
      v_after := jsonb_set(v_after, '{transfer_id}', coalesce(to_jsonb((select t.transfer_number::text from public.v2_transfers t where t.id = new.transfer_id)), 'null'::jsonb));
    end if;
    if v_after ? 'branch_id' then
      v_before := jsonb_set(v_before, '{branch_id}', coalesce(to_jsonb((select coalesce(b.short_name, b.code) from public.v2_school_branches b where b.id = old.branch_id)), 'null'::jsonb));
      v_after := jsonb_set(v_after, '{branch_id}', coalesce(to_jsonb((select coalesce(b.short_name, b.code) from public.v2_school_branches b where b.id = new.branch_id)), 'null'::jsonb));
    end if;
    if v_after ? 'transfer_assigned_at' then
      v_before := jsonb_set(v_before, '{transfer_assigned_at}', coalesce(to_jsonb(to_char(old.transfer_assigned_at at time zone 'Asia/Bishkek', 'YYYY-MM-DD')), 'null'::jsonb));
      v_after := jsonb_set(v_after, '{transfer_assigned_at}', coalesce(to_jsonb(to_char(new.transfer_assigned_at at time zone 'Asia/Bishkek', 'YYYY-MM-DD')), 'null'::jsonb));
    end if;
    v_family := new.family_id;
    v_subject := new.child_name;
  else
    v_family := new.id;
    v_subject := null;
  end if;

  if v_after = '{}'::jsonb then return null; end if;

  insert into public.v2_audit_log (actor_name, action, entity_type, entity_id, old_value, new_value, comment)
  values (public.v2_audit_actor(), 'field_change', case when tg_table_name = 'v2_children' then 'child' else 'family' end,
    v_family, v_before, v_after, v_subject);
  return null;
end;
$$;

drop trigger if exists v2_children_audit_changes on public.v2_children;
create trigger v2_children_audit_changes
  after insert or update on public.v2_children
  for each row execute function public.v2_audit_row_changes();

drop trigger if exists v2_families_audit_changes on public.v2_families;
create trigger v2_families_audit_changes
  after update on public.v2_families
  for each row execute function public.v2_audit_row_changes();

-- Вся история семьи: записи семьи, её детей и их начислений.
-- Скрыто: «Сохранение карточки» и сокращение комментариев (служебные), дубли подтверждения
-- платежа, пересчёт цены трансфера целиком; пересадки ребёнка после 29.10.2026 пишет триггер выше.
create or replace function public.get_family_history(p_family_id text)
returns table (
  id uuid,
  created_at timestamptz,
  actor_name text,
  action text,
  entity_type text,
  old_value jsonb,
  new_value jsonb,
  comment text,
  subject text
)
language sql
stable
as $$
  with kids as (
    select c.id::text as id, c.child_name from public.v2_children c where c.family_id = p_family_id
  ),
  charges as (
    select ch.id::text as id, k.child_name, ch.charge_type, ch.period_month
    from public.v2_charges ch join kids k on k.id = ch.child_id::text
    where ch.family_id = p_family_id
  )
  select l.id, l.created_at, l.actor_name, l.action, l.entity_type, l.old_value, l.new_value, l.comment,
    coalesce(
      (select k.child_name from kids k where k.id = l.entity_id and l.entity_type = 'child'),
      (select ch.child_name || case when ch.charge_type = 'deposit' then ' · депозит' else ' · ' || ch.period_month || ' мес.' end
         from charges ch where ch.id = l.entity_id and l.entity_type = 'charge'),
      l.new_value ->> 'child_name',
      l.old_value ->> 'child_name'
    ) as subject
  from public.v2_audit_log l
  where (
      l.entity_id = p_family_id
      or (l.entity_type = 'child' and l.entity_id in (select k.id from kids k))
      or (l.entity_type = 'charge' and l.entity_id in (select ch.id from charges ch))
    )
    and l.action not in ('Сохранение карточки', 'family_comment_simplified', 'confirm_payment', 'unconfirm_payment')
    and not (l.action = 'transfer_reprice' and l.created_at >= timestamptz '2026-10-29 11:03:00+00'
             and coalesce(l.new_value ->> 'new_vehicle_type', '') = coalesce(l.new_value ->> 'previous_vehicle_type', ''))
  order by l.created_at desc, l.id desc
  limit 2000;
$$;

grant execute on function public.get_family_history(text) to anon, authenticated;
