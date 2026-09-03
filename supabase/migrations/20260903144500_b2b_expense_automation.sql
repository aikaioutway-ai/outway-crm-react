-- Автоматизация расходов B2B:
-- 1) каждая выплата водителю создаёт расход;
-- 2) подтверждённая оплата клиента на юрсчёт создаёт отдельный налог 4%.

create unique index if not exists idx_v2_b2b_expenses_source
  on public.v2_b2b_expenses(source, source_id)
  where source_id is not null;

alter table public.v2_b2b_expenses drop column tax_amount;
alter table public.v2_b2b_expenses drop column net_amount;

alter table public.v2_b2b_expenses add column tax_amount numeric(14,2)
  generated always as (
    case when payment_method = 'legal_account' and source <> 'tax_4pct'
      then round(amount * 0.04, 2) else 0 end
  ) stored;

alter table public.v2_b2b_expenses add column net_amount numeric(14,2)
  generated always as (
    case when payment_method = 'legal_account' and source <> 'tax_4pct'
      then amount - round(amount * 0.04, 2) else amount end
  ) stored;

create or replace function public.v2_b2b_expense_from_driver_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.v2_b2b_expenses (
    expense_date, category, amount, payment_method, purpose,
    order_id, source, source_id
  ) values (
    new.payment_date, 'driver_payments', new.amount, new.payment_method,
    new.purpose, new.order_id, 'driver_payment', new.id
  )
  on conflict (source, source_id) where source_id is not null do update set
    expense_date = excluded.expense_date,
    amount = excluded.amount,
    payment_method = excluded.payment_method,
    purpose = excluded.purpose,
    order_id = excluded.order_id,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists v2_b2b_driver_payment_expense on public.v2_b2b_driver_payments;
create trigger v2_b2b_driver_payment_expense
after insert or update of amount, payment_method, purpose, payment_date, order_id
on public.v2_b2b_driver_payments
for each row execute function public.v2_b2b_expense_from_driver_payment();

create or replace function public.v2_b2b_tax_expense_from_client_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  related_order_number text;
begin
  if new.status = 'confirmed' and new.payment_method = 'legal_account' then
    select order_number into related_order_number
    from public.v2_b2b_orders where id = new.order_id;

    insert into public.v2_b2b_expenses (
      expense_date, category, amount, payment_method, purpose,
      order_id, source, source_id
    ) values (
      new.payment_date, 'taxes', round(new.amount * 0.04, 2), 'legal_account',
      'Налог 4% с оплаты по заказу ' || coalesce(related_order_number, ''),
      new.order_id, 'tax_4pct', new.id
    )
    on conflict (source, source_id) where source_id is not null do update set
      expense_date = excluded.expense_date,
      amount = excluded.amount,
      purpose = excluded.purpose,
      order_id = excluded.order_id,
      updated_at = now();
  else
    delete from public.v2_b2b_expenses
    where source = 'tax_4pct' and source_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists v2_b2b_client_payment_tax_expense on public.v2_b2b_client_payments;
create trigger v2_b2b_client_payment_tax_expense
after insert or update of amount, payment_method, payment_date, status, order_id
on public.v2_b2b_client_payments
for each row execute function public.v2_b2b_tax_expense_from_client_payment();
