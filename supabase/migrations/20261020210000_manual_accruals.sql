-- Ручные начисления вместо автоначисления.
--
-- 1. v2_set_child_charge — поставить, изменить или убрать начисление одного ребёнка
--    (месяц или депозит). Новая сумма сразу списывается с баланса семьи; если сумму
--    уменьшили ниже уже оплаченного, разница возвращается на баланс.
-- 2. v2_copy_previous_month_charges — «Перенести с прошлого месяца»: детям без
--    начисления в месяце ставится сумма их начисления за прошлый месяц.
--    Каждый перенос получает номер операции; v2_undo_copy_previous_month_charges
--    в тот же день отменяет созданные им начисления и возвращает деньги на баланс.
-- 3. v2_create_monthly_accrual_tasks — 1-го числа учебного месяца гендиректору и
--    директору ставится задача проставить начисления, срок — 3-е число.
--
-- Ручные начисления помечаются pricing_managed = false: смена тарифа или типа ТС их не меняет.

create or replace function public.v2_set_child_charge(
  p_child_id uuid,
  p_charge_type text,
  p_month int,
  p_year int,
  p_amount numeric,
  p_actor text default 'CRM'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.v2_children%rowtype;
  v_charge public.v2_charges%rowtype;
  v_type text;
  v_month int;
  v_amount numeric := coalesce(p_amount, 0);
begin
  if v_amount < 0 then raise exception 'Сумма не может быть отрицательной'; end if;

  select * into v_child from public.v2_children where id = p_child_id;
  if not found then raise exception 'Ребёнок не найден'; end if;

  if p_charge_type = 'deposit' then
    -- Депозит учебного года хранится как начисление за май этого года.
    v_type := 'deposit';
    v_month := 5;
  elsif p_charge_type = 'monthly' then
    if p_month not in (1, 2, 3, 4, 5, 9, 10, 11, 12) then raise exception 'Месяц вне учебного года'; end if;
    v_type := case when p_month = 5 then 'may' else 'monthly' end;
    v_month := p_month;
  else
    raise exception 'Неизвестный тип начисления: %', p_charge_type;
  end if;

  select * into v_charge
  from public.v2_charges
  where child_id = p_child_id and period_month = v_month and period_year = p_year and charge_type = v_type
  for update;

  if found then
    if v_amount = 0 then
      if v_charge.status = 'cancelled' then return; end if;
      perform public.v2_adjust_charge(v_charge.id, 0, 'Начисление убрано вручную', p_actor);
      update public.v2_charges set status = 'cancelled', pricing_managed = false where id = v_charge.id;
    else
      if v_charge.status = 'cancelled' then
        update public.v2_charges set status = 'unpaid' where id = v_charge.id;
      end if;
      update public.v2_charges set pricing_managed = false where id = v_charge.id;
      perform public.v2_adjust_charge(v_charge.id, v_amount, 'Начисление изменено вручную', p_actor);
    end if;
  else
    if v_amount = 0 then return; end if;
    insert into public.v2_charges(family_id, child_id, period_month, period_year, charge_type,
      original_amount, amount, paid_amount, pricing_managed, status)
    values (v_child.family_id, v_child.id, v_month, p_year, v_type, v_amount, v_amount, 0, false, 'unpaid');

    insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, new_value, comment)
    values (p_actor, 'manual_charge', 'child', v_child.id::text,
      jsonb_build_object('type', v_type, 'month', v_month, 'year', p_year, 'amount', v_amount),
      'Начисление поставлено вручную');
  end if;

  -- Списание с баланса: сначала депозит, затем месячные начисления.
  perform public.v2_fund_deposit_from_main(v_child.family_id, p_actor);
  perform public.v2_apply_wallet_to_charges(v_child.family_id, 'deposit', p_actor);
  perform public.v2_apply_wallet_to_charges(v_child.family_id, 'main', p_actor);
end;
$$;

create or replace function public.v2_copy_previous_month_charges(
  p_child_ids uuid[],
  p_month int,
  p_year int,
  p_actor text default 'CRM'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_month int := case when p_month = 1 then 12 else p_month - 1 end;
  v_prev_year int := case when p_month = 1 then p_year - 1 else p_year end;
  v_operation_id uuid := gen_random_uuid();
  v_child_id uuid;
  v_amount numeric;
  v_charge_id uuid;
  v_created int := 0;
  v_skipped int := 0;
  v_no_source int := 0;
begin
  if p_month not in (1, 2, 3, 4, 5, 9, 10, 11, 12) then raise exception 'Месяц вне учебного года'; end if;

  foreach v_child_id in array coalesce(p_child_ids, '{}') loop
    if exists (
      select 1 from public.v2_charges
      where child_id = v_child_id and period_month = p_month and period_year = p_year
        and charge_type in ('monthly', 'may') and status <> 'cancelled'
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select amount into v_amount
    from public.v2_charges
    where child_id = v_child_id and period_month = v_prev_month and period_year = v_prev_year
      and charge_type in ('monthly', 'may') and status <> 'cancelled' and amount > 0
    limit 1;

    if v_amount is null then
      v_no_source := v_no_source + 1;
      continue;
    end if;

    perform public.v2_set_child_charge(v_child_id, 'monthly', p_month, p_year, v_amount, p_actor);

    select id into v_charge_id from public.v2_charges
    where child_id = v_child_id and period_month = p_month and period_year = p_year
      and charge_type in ('monthly', 'may');
    -- По этой записи перенос можно отменить.
    insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, new_value, comment)
    values (p_actor, 'copy_previous_month_charge', 'charge', v_charge_id::text,
      jsonb_build_object('operationId', v_operation_id, 'childId', v_child_id, 'amount', v_amount,
        'month', p_month, 'year', p_year),
      'Перенос начисления с прошлого месяца');
    v_created := v_created + 1;
    v_amount := null;
  end loop;

  return jsonb_build_object('operationId', case when v_created > 0 then v_operation_id end,
    'created', v_created, 'skipped', v_skipped, 'noSource', v_no_source);
end;
$$;

create or replace function public.v2_undo_copy_previous_month_charges(p_operation_id uuid, p_actor text default 'CRM')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry record;
  v_charge public.v2_charges%rowtype;
  v_undone int := 0;
  v_changed int := 0;
  v_changed_names text[] := '{}';
begin
  if exists (
    select 1 from public.v2_audit_log
    where action = 'undo_copy_previous_month' and new_value ->> 'operationId' = p_operation_id::text
  ) then
    raise exception 'Этот перенос уже отменён';
  end if;

  if not exists (
    select 1 from public.v2_audit_log
    where action = 'copy_previous_month_charge' and new_value ->> 'operationId' = p_operation_id::text
  ) then
    raise exception 'Перенос не найден';
  end if;

  if exists (
    select 1 from public.v2_audit_log
    where action = 'copy_previous_month_charge' and new_value ->> 'operationId' = p_operation_id::text
      and (created_at at time zone 'Asia/Bishkek')::date < (now() at time zone 'Asia/Bishkek')::date
  ) then
    raise exception 'Перенос можно отменить только в тот же день';
  end if;

  for v_entry in
    select entity_id, new_value from public.v2_audit_log
    where action = 'copy_previous_month_charge' and new_value ->> 'operationId' = p_operation_id::text
  loop
    select * into v_charge from public.v2_charges where id = v_entry.entity_id::uuid;
    if not found or v_charge.status = 'cancelled' then continue; end if;

    -- Сумму после переноса поменяли вручную — такое начисление не трогаем.
    if v_charge.amount <> (v_entry.new_value ->> 'amount')::numeric then
      v_changed := v_changed + 1;
      v_changed_names := v_changed_names
        || coalesce((select child_name from public.v2_children where id = v_charge.child_id), v_charge.child_id::text);
      continue;
    end if;

    perform public.v2_set_child_charge(v_charge.child_id, 'monthly', v_charge.period_month, v_charge.period_year, 0, p_actor);
    v_undone := v_undone + 1;
  end loop;

  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, new_value, comment)
  values (p_actor, 'undo_copy_previous_month', 'operation', p_operation_id::text,
    jsonb_build_object('operationId', p_operation_id, 'undone', v_undone, 'changed', v_changed),
    'Отмена переноса начислений');

  return jsonb_build_object('undone', v_undone, 'changed', v_changed, 'changedNames', to_jsonb(v_changed_names));
end;
$$;

grant execute on function public.v2_set_child_charge(uuid, text, int, int, numeric, text) to anon, authenticated, service_role;
grant execute on function public.v2_copy_previous_month_charges(uuid[], int, int, text) to anon, authenticated, service_role;
grant execute on function public.v2_undo_copy_previous_month_charges(uuid, text) to anon, authenticated, service_role;

-- Задача на начисления ----------------------------------------------------------

create or replace function public.v2_create_monthly_accrual_tasks(p_date date default (now() at time zone 'Asia/Bishkek')::date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month int := extract(month from p_date)::int;
  v_year int := extract(year from p_date)::int;
  v_names text[] := array['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  v_title text;
  v_due timestamptz;
  v_employee record;
  v_task_id uuid;
  v_created int := 0;
begin
  if v_month not in (1, 2, 3, 4, 5, 9, 10, 11, 12) then return 0; end if;

  v_title := 'Проставить начисления за ' || v_names[v_month];
  v_due := make_timestamptz(v_year, v_month, 3, 18, 0, 0, 'Asia/Bishkek');

  for v_employee in
    select id from public.v2_employees where role in ('gen_director', 'director') and status = 'active'
  loop
    if exists (
      select 1 from public.v2_tasks
      where assignee_id = v_employee.id and title = v_title and deleted_at is null
        and created_at >= make_timestamptz(v_year, v_month, 1, 0, 0, 0, 'Asia/Bishkek')
    ) then
      continue;
    end if;

    insert into public.v2_tasks(title, description, creator_id, assignee_id, due_at, priority, requires_review, target)
    values (
      v_title,
      'Раздел «Начисления»: по каждому трансферу нажать «Перенести с прошлого месяца» и проверить суммы. '
        || 'Начисление сразу списывается с баланса семьи.',
      v_employee.id, v_employee.id, v_due, 'normal', false,
      '{"type":"general","id":"","label":"Начисления"}'::jsonb
    )
    returning id into v_task_id;

    insert into public.v2_task_events(task_id, actor_id, action, comment, new_value)
    values (v_task_id, v_employee.id, 'create', 'Автоматическая задача на начисления', jsonb_build_object('title', v_title));
    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

revoke all on function public.v2_create_monthly_accrual_tasks(date) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'monthly-accrual-task') then
      perform cron.unschedule('monthly-accrual-task');
    end if;
    -- 00:00 UTC = 06:00 по Бишкеку, 1-го числа.
    perform cron.schedule('monthly-accrual-task', '0 0 1 * *', 'select public.v2_create_monthly_accrual_tasks()');
  end if;
end $$;
