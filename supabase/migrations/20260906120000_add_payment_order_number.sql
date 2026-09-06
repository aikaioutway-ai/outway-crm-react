-- Номер платёжного поручения — общее поле для всех мест, где фиксируется оплата:
-- Расходы, Зарплата, B2B (оплаты клиентов, выплаты водителям, расходы) и Семьи (платежи).

alter table public.v2_expenses add column if not exists payment_order_number text;
alter table public.v2_payroll_payments add column if not exists payment_order_number text;
alter table public.v2_payments add column if not exists payment_order_number text;
alter table public.v2_b2b_client_payments add column if not exists payment_order_number text;
alter table public.v2_b2b_driver_payments add column if not exists payment_order_number text;
alter table public.v2_b2b_expenses add column if not exists payment_order_number text;

-- Выплаты зарплаты: RPC пересоздаётся с новым необязательным параметром.
create or replace function public.v2_record_payroll_payments(
  p_batch_id uuid,
  p_period_month int,
  p_period_year int,
  p_payment_date date,
  p_payment_method text,
  p_recipient_id text,
  p_recipient_name text,
  p_paid_by_name text,
  p_comment text,
  p_payments jsonb,
  p_payment_order_number text default null
)
returns setof public.v2_payroll_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  item_subject_id text;
  item_subject_type text;
  item_amount numeric(12, 2);
  item_accrued numeric(12, 2);
  item_paid numeric(12, 2);
  item_advance numeric(12, 2);
  item_remaining numeric(12, 2);
begin
  if p_period_month not between 1 and 12 or p_period_year < 2020 then
    raise exception 'Некорректный период выплаты';
  end if;
  if p_payment_method not in ('cash', 'cashless') then
    raise exception 'Некорректный способ выплаты';
  end if;
  if coalesce(trim(p_recipient_name), '') = '' then
    raise exception 'Не указан получатель выплаты';
  end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'Не выбраны получатели зарплаты';
  end if;

  for item in select value from jsonb_array_elements(p_payments)
  loop
    item_subject_id := trim(item->>'subjectId');
    item_subject_type := trim(item->>'subjectType');
    item_amount := (item->>'amount')::numeric;
    if item_subject_id = '' or item_subject_type not in ('driver', 'employee') or item_amount <= 0 then
      raise exception 'Некорректная строка выплаты';
    end if;

    select
      coalesce(entry.accrued_amount, entry.days * entry.rate + entry.bonus_amount - entry.penalty_amount),
      coalesce(entry.salary_amount, 0)
    into item_accrued, item_paid
    from public.v2_payroll_entries entry
    where entry.subject_id = item_subject_id
      and entry.subject_type = item_subject_type
      and entry.period_month = p_period_month
      and entry.period_year = p_period_year
    for update;
    if not found then
      raise exception 'Строка табеля для выплаты не найдена';
    end if;

    item_advance := 0;
    if item_subject_type = 'driver' then
      select coalesce(sum(advance.amount), 0)
      into item_advance
      from public.v2_driver_advances advance
      where advance.driver_id = item_subject_id
        and advance.date >= make_date(p_period_year, p_period_month, 1)
        and advance.date < make_date(p_period_year, p_period_month, 1) + interval '1 month';
    end if;
    item_remaining := greatest(0, item_accrued - item_paid - item_advance);
    if item_amount > item_remaining then
      raise exception 'Сумма выплаты превышает остаток зарплаты';
    end if;

    insert into public.v2_payroll_payments (
      batch_id, subject_id, subject_type, period_month, period_year, amount,
      payment_date, payment_method, recipient_id, recipient_name, paid_by_name, comment,
      payment_order_number
    ) values (
      p_batch_id, item_subject_id, item_subject_type, p_period_month, p_period_year, item_amount,
      p_payment_date, p_payment_method, nullif(trim(p_recipient_id), ''), trim(p_recipient_name),
      nullif(trim(p_paid_by_name), ''), nullif(trim(p_comment), ''), nullif(trim(p_payment_order_number), '')
    );

    update public.v2_payroll_entries
      set salary_amount = salary_amount + item_amount
      where subject_id = item_subject_id
        and subject_type = item_subject_type
        and period_month = p_period_month
        and period_year = p_period_year;
  end loop;

  return query
    select payment.* from public.v2_payroll_payments payment
    where payment.batch_id = p_batch_id
    order by payment.created_at, payment.id;
end;
$$;

revoke all on function public.v2_record_payroll_payments(uuid, int, int, date, text, text, text, text, text, jsonb, text) from public;
grant execute on function public.v2_record_payroll_payments(uuid, int, int, date, text, text, text, text, text, jsonb, text) to anon, authenticated;

-- Возврат средств: чек/платёжка теперь можно указать при подтверждении.
create or replace function public.v2_confirm_refund(
  p_refund_id uuid,
  p_confirmed_by text default null,
  p_expense_payment_method text default 'cashless',
  p_payment_order_number text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_refund public.v2_refunds%rowtype;
  v_family_name text;
  v_tx_id uuid;
  v_expense_id uuid;
begin
  select * into v_refund
  from public.v2_refunds
  where id = p_refund_id
  for update;

  if not found then
    raise exception 'Refund not found: %', p_refund_id;
  end if;
  if v_refund.status <> 'pending' then
    raise exception 'Refund is not pending: %', v_refund.status;
  end if;

  select parent_name into v_family_name
  from public.v2_families
  where id = v_refund.family_id;

  v_tx_id := public.v2_add_wallet_transaction(
    v_refund.family_id, 'main', 'refund', -v_refund.amount,
    'refund', p_refund_id, v_refund.comment, p_confirmed_by
  );

  insert into public.v2_expenses(
    name, category, subcategory, unit_price, quantity, amount,
    expense_date, payment_method, comment, created_by, payment_order_number
  )
  values (
    'Возврат — ' || coalesce(v_family_name, v_refund.family_id),
    'school', 'Возврат', v_refund.amount, 1, v_refund.amount,
    current_date, p_expense_payment_method, v_refund.comment, p_confirmed_by,
    nullif(trim(p_payment_order_number), '')
  )
  returning id into v_expense_id;

  update public.v2_refunds
    set status = 'confirmed',
        reviewed_by = p_confirmed_by,
        reviewed_at = now(),
        wallet_transaction_id = v_tx_id,
        expense_id = v_expense_id
    where id = p_refund_id;

  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, new_value, comment)
  values (
    p_confirmed_by,
    'confirm_refund',
    'refund',
    p_refund_id::text,
    jsonb_build_object('amount', v_refund.amount, 'expense_id', v_expense_id),
    'Refund confirmed by cashier'
  );
end;
$$;

notify pgrst, 'reload schema';
