-- Начисление при посадке, депозит в приоритете, отключение штрафов.
--
-- 1. Штрафов нет: задача daily-penalty-job снимается с расписания.
-- 2. «Посажен» создаёт начисление за текущий учебный месяц и депозит
--    (один на ребёнка на учебный год; депозит закрывает май).
-- 3. Деньги семьи сначала закрывают депозит, остаток идёт на месячные
--    начисления — и при подтверждении платежа, и при посадке (предоплата,
--    лежащая на основном балансе, переносится на депозит).
-- 4. Отмена подтверждения / отмена платежа корректно откатывают списания.

-- Штрафы -------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
    and exists (select 1 from cron.job where jobname = 'daily-penalty-job') then
    perform cron.unschedule('daily-penalty-job');
  end if;
end $$;

-- Типы операций кошелька -------------------------------------------------------

alter table public.v2_wallet_transactions
  drop constraint if exists v2_wallet_transactions_transaction_type_check;

alter table public.v2_wallet_transactions
  add constraint v2_wallet_transactions_transaction_type_check
  check (transaction_type in (
    'payment_confirmed', 'payment_reversed', 'payment_cancelled', 'charge_writeoff', 'deposit_writeoff',
    'deposit_topup', 'adjustment_refund', 'manual_adjustment', 'refund',
    'refund_cancelled', 'transfer_repricing', 'deposit_transfer', 'writeoff_reversed'
  ));

-- Сколько ещё не хватает на депозит семьи (с учётом денег на депозитном балансе).
create or replace function public.v2_family_deposit_need(p_family_id text)
returns numeric
language sql
stable
set search_path = public
as $$
  select greatest(
    coalesce((
      select sum(amount - paid_amount)
      from public.v2_charges
      where family_id = p_family_id
        and charge_type = 'deposit'
        and status <> 'cancelled'
        and amount > paid_amount
    ), 0)
    - greatest(coalesce((select deposit_balance from public.v2_family_wallets where family_id = p_family_id), 0), 0),
    0
  );
$$;

-- Перенос свободных денег с основного баланса на депозит (сначала депозит).
create or replace function public.v2_fund_deposit_from_main(p_family_id text, p_actor text default 'CRM')
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_need numeric := public.v2_family_deposit_need(p_family_id);
  v_main numeric;
  v_move numeric;
begin
  if v_need <= 0 then return 0; end if;
  perform public.v2_ensure_family_wallet(p_family_id);
  select greatest(main_balance, 0) into v_main from public.v2_family_wallets where family_id = p_family_id for update;
  v_move := least(v_main, v_need);
  if v_move <= 0 then return 0; end if;

  perform public.v2_add_wallet_transaction(p_family_id, 'main', 'deposit_transfer', -v_move,
    'deposit_transfer', null, 'Перенос на депозит', p_actor);
  perform public.v2_add_wallet_transaction(p_family_id, 'deposit', 'deposit_transfer', v_move,
    'deposit_transfer', null, 'Перенос на депозит', p_actor);
  return v_move;
end;
$$;

-- Откат списаний, если баланс ушёл в минус (отмена платежа): снимаем оплату
-- с последних оплаченных начислений, пока баланс не станет нулевым.
create or replace function public.v2_unwind_wallet_deficit(p_family_id text, p_wallet_type text, p_actor text default 'CRM')
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_charge public.v2_charges%rowtype;
  v_take numeric;
  v_total numeric := 0;
begin
  loop
    select case when p_wallet_type = 'deposit' then deposit_balance else main_balance end
      into v_balance
    from public.v2_family_wallets where family_id = p_family_id;
    exit when coalesce(v_balance, 0) >= 0;

    select * into v_charge
    from public.v2_charges
    where family_id = p_family_id
      and paid_amount > 0
      and status <> 'cancelled'
      and (
        (p_wallet_type = 'main' and charge_type = 'monthly' and period_month <> 5)
        or (p_wallet_type = 'deposit' and charge_type in ('may', 'deposit'))
      )
    order by period_year desc, period_month desc, created_at desc
    limit 1
    for update;
    exit when not found;

    v_take := least(v_charge.paid_amount, -v_balance);
    update public.v2_charges set paid_amount = paid_amount - v_take where id = v_charge.id;
    perform public.v2_refresh_charge_status(v_charge.id);
    perform public.v2_add_wallet_transaction(p_family_id, p_wallet_type, 'writeoff_reversed', v_take,
      'charge', v_charge.id, 'Откат списания после отмены платежа', p_actor);
    v_total := v_total + v_take;
  end loop;
  return v_total;
end;
$$;

-- Подтверждение платежа: сначала депозит, остаток — на основной баланс.
-- Переданное разбиение игнорируется, его считает база.
create or replace function public.v2_confirm_payment(
  p_payment_id uuid,
  p_main_amount numeric,
  p_deposit_amount numeric,
  p_reviewed_by text default null,
  p_actual_payment_date date default current_date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.v2_payments%rowtype;
  v_deposit numeric;
  v_main numeric;
begin
  select * into v_payment from public.v2_payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found: %', p_payment_id; end if;
  if v_payment.status <> 'pending' then raise exception 'Payment is not pending: %', v_payment.status; end if;

  v_deposit := least(v_payment.amount, public.v2_family_deposit_need(v_payment.family_id));
  v_main := v_payment.amount - v_deposit;

  update public.v2_payments
    set status = 'confirmed',
        confirmed_main_amount = v_main,
        confirmed_deposit_amount = v_deposit,
        actual_payment_date = coalesce(p_actual_payment_date, current_date),
        reviewed_by = p_reviewed_by,
        reviewed_at = now()
    where id = p_payment_id;

  if v_deposit > 0 then
    perform public.v2_add_wallet_transaction(v_payment.family_id, 'deposit', 'deposit_topup', v_deposit,
      'payment', p_payment_id, v_payment.comment, p_reviewed_by);
  end if;
  if v_main > 0 then
    perform public.v2_add_wallet_transaction(v_payment.family_id, 'main', 'payment_confirmed', v_main,
      'payment', p_payment_id, v_payment.comment, p_reviewed_by);
  end if;

  perform public.v2_apply_wallet_to_charges(v_payment.family_id, 'deposit', p_reviewed_by);
  perform public.v2_apply_wallet_to_charges(v_payment.family_id, 'main', p_reviewed_by);

  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, old_value, new_value, comment)
  values (
    coalesce(p_reviewed_by, 'CRM'), 'confirm_payment', 'payment', p_payment_id::text,
    jsonb_build_object('status', v_payment.status),
    jsonb_build_object('status', 'confirmed', 'main', v_main, 'deposit', v_deposit,
      'actual_payment_date', coalesce(p_actual_payment_date, current_date)),
    'Payment confirmed by cashier'
  );
end;
$$;

-- Старая перегрузка без даты — ведёт в ту же логику.
create or replace function public.v2_confirm_payment(
  p_payment_id uuid,
  p_main_amount numeric,
  p_deposit_amount numeric,
  p_reviewed_by text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  select public.v2_confirm_payment(p_payment_id, p_main_amount, p_deposit_amount, p_reviewed_by, current_date);
$$;

-- Вернуть подтверждённый платёж на проверку.
create or replace function public.v2_unconfirm_payment(p_payment_id uuid, p_actor text default 'CRM')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.v2_payments%rowtype;
begin
  select * into v_payment from public.v2_payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found: %', p_payment_id; end if;
  if v_payment.status <> 'confirmed' then raise exception 'Payment is not confirmed: %', v_payment.status; end if;

  if v_payment.confirmed_main_amount > 0 then
    perform public.v2_add_wallet_transaction(v_payment.family_id, 'main', 'payment_reversed',
      -v_payment.confirmed_main_amount, 'payment', p_payment_id, 'Отмена подтверждения', p_actor);
  end if;
  if v_payment.confirmed_deposit_amount > 0 then
    perform public.v2_add_wallet_transaction(v_payment.family_id, 'deposit', 'payment_reversed',
      -v_payment.confirmed_deposit_amount, 'payment', p_payment_id, 'Отмена подтверждения', p_actor);
  end if;

  update public.v2_payments
    set status = 'pending', confirmed_main_amount = 0, confirmed_deposit_amount = 0,
        reviewed_by = null, reviewed_at = null
    where id = p_payment_id;

  perform public.v2_unwind_wallet_deficit(v_payment.family_id, 'main', p_actor);
  perform public.v2_unwind_wallet_deficit(v_payment.family_id, 'deposit', p_actor);

  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, old_value, new_value, comment)
  values (p_actor, 'unconfirm_payment', 'payment', p_payment_id::text,
    jsonb_build_object('status', 'confirmed', 'main', v_payment.confirmed_main_amount, 'deposit', v_payment.confirmed_deposit_amount),
    jsonb_build_object('status', 'pending'), 'Отмена подтверждения');
end;
$$;

-- Отмена подтверждённого платежа.
create or replace function public.v2_cancel_payment(p_payment_id uuid, p_reason text, p_cancelled_by text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.v2_payments%rowtype;
begin
  select * into v_payment from public.v2_payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found: %', p_payment_id; end if;
  if v_payment.status <> 'confirmed' then
    raise exception 'Only confirmed payments can be cancelled, current status: %', v_payment.status;
  end if;

  if v_payment.confirmed_main_amount > 0 then
    perform public.v2_add_wallet_transaction(v_payment.family_id, 'main', 'payment_cancelled',
      -v_payment.confirmed_main_amount, 'payment', p_payment_id, p_reason, p_cancelled_by);
  end if;
  if v_payment.confirmed_deposit_amount > 0 then
    perform public.v2_add_wallet_transaction(v_payment.family_id, 'deposit', 'payment_cancelled',
      -v_payment.confirmed_deposit_amount, 'payment', p_payment_id, p_reason, p_cancelled_by);
  end if;

  update public.v2_payments
    set status = 'cancelled', reject_reason = p_reason, reviewed_by = p_cancelled_by, reviewed_at = now()
    where id = p_payment_id;

  perform public.v2_unwind_wallet_deficit(v_payment.family_id, 'main', coalesce(p_cancelled_by, 'CRM'));
  perform public.v2_unwind_wallet_deficit(v_payment.family_id, 'deposit', coalesce(p_cancelled_by, 'CRM'));

  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, old_value, new_value, comment)
  values (p_cancelled_by, 'cancel_payment', 'payment', p_payment_id::text,
    jsonb_build_object('status', 'confirmed', 'amount', v_payment.amount),
    jsonb_build_object('status', 'cancelled'), p_reason);
end;
$$;

-- Начисление при посадке ----------------------------------------------------------

create or replace function public.v2_charge_child_on_boarding(p_child_id uuid, p_actor text default 'CRM')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.v2_children%rowtype;
  v_month int := extract(month from current_date)::int;
  v_year int := extract(year from current_date)::int;
  v_academic boolean;
  v_price_month int;
  v_deposit_year int;
  v_price numeric;
begin
  select * into v_child from public.v2_children where id = p_child_id;
  if not found or v_child.status <> 'boarded' then return; end if;

  v_academic := v_month in (1, 2, 3, 4, 5, 9, 10, 11, 12);
  -- Летом (июнь–август) депозит берём по цене сентября, месяц начислит крон 1 сентября.
  v_price_month := case when v_academic then v_month else 9 end;
  v_deposit_year := case when v_month >= 6 then v_year + 1 else v_year end;
  v_price := public.v2_child_period_price(v_child.id, v_price_month, v_year);

  if v_price > 0 and not exists (
    select 1 from public.v2_charges
    where child_id = v_child.id and charge_type = 'deposit' and period_year = v_deposit_year
  ) then
    insert into public.v2_charges(family_id, child_id, period_month, period_year, charge_type,
      original_amount, amount, paid_amount, pricing_managed, status)
    values (v_child.family_id, v_child.id, 5, v_deposit_year, 'deposit', v_price, v_price, 0, true, 'unpaid')
    on conflict (child_id, period_month, period_year, charge_type) do nothing;
  end if;

  -- Май закрывает депозит — отдельного майского начисления нет.
  if v_academic and v_price > 0 and not (v_month = 5 and exists (
    select 1 from public.v2_charges
    where child_id = v_child.id and charge_type = 'deposit' and period_year = v_year
  )) then
    insert into public.v2_charges(family_id, child_id, period_month, period_year, charge_type,
      original_amount, amount, paid_amount, pricing_managed, status)
    values (v_child.family_id, v_child.id, v_month, v_year,
      case when v_month = 5 then 'may' else 'monthly' end, v_price, v_price, 0, true, 'unpaid')
    on conflict (child_id, period_month, period_year, charge_type) do nothing;
  end if;

  perform public.v2_fund_deposit_from_main(v_child.family_id, p_actor);
  perform public.v2_apply_wallet_to_charges(v_child.family_id, 'deposit', p_actor);
  perform public.v2_apply_wallet_to_charges(v_child.family_id, 'main', p_actor);

  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, new_value, comment)
  values (p_actor, 'charge_on_boarding', 'child', v_child.id::text,
    jsonb_build_object('month', v_month, 'year', v_year, 'price', v_price, 'deposit_year', v_deposit_year),
    'Начисление при посадке');
end;
$$;

create or replace function public.v2_children_charge_on_boarding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'boarded' and (tg_op = 'INSERT' or old.status is distinct from 'boarded') then
    perform public.v2_charge_child_on_boarding(new.id, 'CRM');
  end if;
  return null;
end;
$$;

drop trigger if exists trg_v2_children_charge_on_boarding on public.v2_children;
create trigger trg_v2_children_charge_on_boarding
after insert or update of status on public.v2_children
for each row execute function public.v2_children_charge_on_boarding();

-- Ежемесячные начисления: май не начисляется тем, у кого есть депозит на этот май,
-- и перед списанием свободные деньги закрывают депозит.
create or replace function public.v2_create_period_charges(p_month int, p_year int, p_created_by text default 'cron')
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_family_id text;
begin
  if p_month not in (1, 2, 3, 4, 5, 9, 10, 11, 12) then
    raise exception 'Месяц % вне учебного сезона', p_month;
  end if;

  perform public.v2_refresh_child_prices();

  insert into public.v2_charges(
    family_id, child_id, period_month, period_year, charge_type,
    original_amount, amount, paid_amount, pricing_managed, status
  )
  select c.family_id, c.id, p_month, p_year,
    case when p_month = 5 then 'may' else 'monthly' end,
    price.value, price.value, 0, true, 'unpaid'
  from public.v2_children c
  cross join lateral (select public.v2_child_period_price(c.id, p_month, p_year) as value) price
  where c.status = 'boarded'
    and price.value > 0
    and not (p_month = 5 and exists (
      select 1 from public.v2_charges d
      where d.child_id = c.id and d.charge_type = 'deposit' and d.period_year = p_year
    ))
  on conflict (child_id, period_month, period_year, charge_type) do nothing;

  get diagnostics v_count = row_count;

  for v_family_id in select distinct family_id from public.v2_children where status = 'boarded' loop
    perform public.v2_fund_deposit_from_main(v_family_id, p_created_by);
    perform public.v2_apply_wallet_to_charges(v_family_id, 'deposit', p_created_by);
    perform public.v2_apply_wallet_to_charges(v_family_id, 'main', p_created_by);
  end loop;

  return v_count;
end;
$$;

-- Права ------------------------------------------------------------------------

revoke all on function public.v2_fund_deposit_from_main(text, text) from public, anon, authenticated;
revoke all on function public.v2_unwind_wallet_deficit(text, text, text) from public, anon, authenticated;
revoke all on function public.v2_charge_child_on_boarding(uuid, text) from public, anon, authenticated;
revoke all on function public.v2_create_period_charges(int, int, text) from public, anon, authenticated;
grant execute on function public.v2_fund_deposit_from_main(text, text) to service_role;
grant execute on function public.v2_unwind_wallet_deficit(text, text, text) to service_role;
grant execute on function public.v2_charge_child_on_boarding(uuid, text) to service_role;
grant execute on function public.v2_create_period_charges(int, int, text) to service_role;
grant execute on function public.v2_unconfirm_payment(uuid, text) to anon, authenticated;
grant execute on function public.v2_family_deposit_need(text) to anon, authenticated;

-- Пополнять кошелёк напрямую из браузера больше нельзя: все движения денег
-- идут через функции подтверждения/отмены.
revoke execute on function public.v2_add_wallet_transaction(text, text, text, numeric, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.v2_add_wallet_transaction(text, text, text, numeric, text, uuid, text, text) to service_role;

notify pgrst, 'reload schema';
