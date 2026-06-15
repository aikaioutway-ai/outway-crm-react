alter table public.v2_payments
add column if not exists actual_payment_date date;

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
as $$
declare
  v_payment public.v2_payments%rowtype;
begin
  select * into v_payment
  from public.v2_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found: %', p_payment_id;
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'Payment is not pending: %', v_payment.status;
  end if;

  if p_main_amount < 0 or p_deposit_amount < 0 or p_main_amount + p_deposit_amount > v_payment.amount then
    raise exception 'Invalid payment split';
  end if;

  update public.v2_payments
    set status = 'confirmed',
        confirmed_main_amount = p_main_amount,
        confirmed_deposit_amount = p_deposit_amount,
        actual_payment_date = coalesce(p_actual_payment_date, current_date),
        reviewed_by = p_reviewed_by,
        reviewed_at = now()
    where id = p_payment_id;

  if p_main_amount > 0 then
    perform public.v2_add_wallet_transaction(
      v_payment.family_id, 'main', 'payment_confirmed', p_main_amount,
      'payment', p_payment_id, v_payment.comment, p_reviewed_by
    );
  end if;

  if p_deposit_amount > 0 then
    perform public.v2_add_wallet_transaction(
      v_payment.family_id, 'deposit', 'payment_confirmed', p_deposit_amount,
      'payment', p_payment_id, v_payment.comment, p_reviewed_by
    );
  end if;

  perform public.v2_apply_wallet_to_charges(v_payment.family_id, 'main', p_reviewed_by);
  perform public.v2_apply_wallet_to_charges(v_payment.family_id, 'deposit', p_reviewed_by);

  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, old_value, new_value, comment)
  values (
    coalesce(p_reviewed_by, 'CRM'),
    'confirm_payment',
    'payment',
    p_payment_id::text,
    jsonb_build_object('status', v_payment.status),
    jsonb_build_object(
      'status', 'confirmed',
      'main', p_main_amount,
      'deposit', p_deposit_amount,
      'actual_payment_date', coalesce(p_actual_payment_date, current_date)
    ),
    'Payment confirmed by cashier'
  );
end;
$$;
