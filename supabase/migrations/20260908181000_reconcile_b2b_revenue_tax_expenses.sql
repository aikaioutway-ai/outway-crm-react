-- Rebuild automatic tax rows from their source payments and remove orphaned copies.
delete from public.v2_b2b_expenses expense
where expense.source = 'tax_4pct'
  and expense.source_id is not null
  and not exists (
    select 1 from public.v2_b2b_client_payments payment
    where payment.id = expense.source_id
  );

update public.v2_b2b_expenses expense
set amount = round(payment.amount * 0.04, 2),
    expense_date = payment.payment_date,
    order_id = payment.order_id,
    payment_method = 'legal_account',
    updated_at = now()
from public.v2_b2b_client_payments payment
where expense.source = 'tax_4pct'
  and expense.source_id = payment.id
  and payment.status = 'confirmed'
  and payment.payment_method = 'legal_account'
  and (expense.amount, expense.expense_date, expense.order_id) is distinct from
      (round(payment.amount * 0.04, 2), payment.payment_date, payment.order_id);

create or replace function public.v2_b2b_tax_expense_delete_from_client_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.v2_b2b_expenses
  where source = 'tax_4pct'
    and source_id = old.id;
  return old;
end;
$$;

drop trigger if exists v2_b2b_client_payment_tax_expense_cleanup on public.v2_b2b_client_payments;
create trigger v2_b2b_client_payment_tax_expense_cleanup
after delete on public.v2_b2b_client_payments
for each row execute function public.v2_b2b_tax_expense_delete_from_client_payment();
