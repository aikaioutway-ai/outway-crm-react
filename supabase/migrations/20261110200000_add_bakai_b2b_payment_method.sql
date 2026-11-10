alter table public.v2_b2b_order_driver_assignments
  drop constraint v2_b2b_order_driver_assignments_advance_payment_method_check,
  add constraint v2_b2b_order_driver_assignments_advance_payment_method_check CHECK (((advance_payment_method IS NULL) OR (advance_payment_method = ANY (ARRAY['cash'::text, 'legal_account'::text, 'personal_account'::text, 'bakai_account'::text]))));

alter table public.v2_b2b_client_payments
  drop constraint v2_b2b_client_payments_payment_method_check,
  add constraint v2_b2b_client_payments_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'legal_account'::text, 'personal_account'::text, 'bakai_account'::text])));

alter table public.v2_b2b_driver_payments
  drop constraint v2_b2b_driver_payments_payment_method_check,
  add constraint v2_b2b_driver_payments_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'legal_account'::text, 'personal_account'::text, 'bakai_account'::text])));

alter table public.v2_b2b_expenses
  drop constraint v2_b2b_expenses_payment_method_check,
  add constraint v2_b2b_expenses_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'legal_account'::text, 'personal_account'::text, 'bakai_account'::text])));

CREATE OR REPLACE FUNCTION public.v2_b2b_tax_expense_from_client_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  related_order_number text;
begin
  if new.status = 'confirmed' and new.payment_method in ('legal_account', 'bakai_account') then
    select order_number into related_order_number
    from public.v2_b2b_orders where id = new.order_id;

    insert into public.v2_b2b_expenses (
      expense_date, category, amount, payment_method, purpose,
      order_id, source, source_id
    ) values (
      new.payment_date, 'taxes', round(new.amount * 0.04, 2), new.payment_method,
      'Налог 4% с оплаты по заказу ' || coalesce(related_order_number, ''),
      new.order_id, 'tax_4pct', new.id
    )
    on conflict (source, source_id) where source_id is not null do update set
      expense_date = excluded.expense_date,
      amount = excluded.amount,
      payment_method = excluded.payment_method,
      purpose = excluded.purpose,
      order_id = excluded.order_id,
      updated_at = now();
  else
    delete from public.v2_b2b_expenses
    where source = 'tax_4pct' and source_id = new.id;
  end if;
  return new;
end;
$function$;
