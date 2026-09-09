insert into public.v2_b2b_expenses (
  expense_date, category, amount, payment_method, purpose,
  order_id, source, source_id
)
select
  payment.payment_date,
  'taxes',
  round(payment.amount * 0.04, 2),
  'legal_account',
  'Налог 4% с оплаты по заказу ' || coalesce(b2b_order.order_number, ''),
  payment.order_id,
  'tax_4pct',
  payment.id
from public.v2_b2b_client_payments payment
left join public.v2_b2b_orders b2b_order on b2b_order.id = payment.order_id
where payment.status = 'confirmed'
  and payment.payment_method = 'legal_account'
  and not exists (
    select 1 from public.v2_b2b_expenses expense
    where expense.source = 'tax_4pct'
      and expense.source_id = payment.id
  );
