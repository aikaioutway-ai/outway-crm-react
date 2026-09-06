-- Remove automatic expense rows whose source driver payment no longer exists,
-- and keep them in sync when a driver payment is deleted later.

delete from public.v2_b2b_expenses expense
where expense.source = 'driver_payment'
  and expense.source_id is not null
  and not exists (
    select 1
    from public.v2_b2b_driver_payments payment
    where payment.id = expense.source_id
  );

create or replace function public.v2_b2b_expense_delete_from_driver_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.v2_b2b_expenses
  where source = 'driver_payment'
    and source_id = old.id;
  return old;
end;
$$;

drop trigger if exists v2_b2b_driver_payment_expense_cleanup on public.v2_b2b_driver_payments;
create trigger v2_b2b_driver_payment_expense_cleanup
after delete on public.v2_b2b_driver_payments
for each row execute function public.v2_b2b_expense_delete_from_driver_payment();
