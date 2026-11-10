-- Возврат родителю: если свободных денег в основном кошельке не хватает,
-- оплата снимается с ранее оплаченных начислений — сначала с последних месяцев,
-- депозит в самую последнюю очередь (как при отмене подтверждения платежа).
-- Раньше возврат уводил кошелёк в минус, а начисления оставались «оплаченными»,
-- из-за чего долг семьи был занижен.

create or replace function public.v2_settle_refund_deficit(p_family_id text, p_actor text default 'CRM')
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_main numeric;
begin
  -- 1. Откат оплаты месяцев (с последнего).
  perform public.v2_unwind_wallet_deficit(p_family_id, 'main', p_actor);

  -- 2. Если месяцев не хватило — остаток покрывается за счёт депозита:
  --    сначала свободные деньги депозитного кошелька, затем откат оплаты депозита.
  select main_balance into v_main from public.v2_family_wallets where family_id = p_family_id;
  if coalesce(v_main, 0) < 0 then
    perform public.v2_add_wallet_transaction(p_family_id, 'main', 'deposit_transfer', -v_main,
      null, null, 'Возврат: покрытие за счёт депозита', p_actor);
    perform public.v2_add_wallet_transaction(p_family_id, 'deposit', 'deposit_transfer', v_main,
      null, null, 'Возврат: покрытие за счёт депозита', p_actor);
    perform public.v2_unwind_wallet_deficit(p_family_id, 'deposit', p_actor);
  end if;
end;
$function$;

revoke all on function public.v2_settle_refund_deficit(text, text) from public, anon, authenticated;

create or replace function public.v2_confirm_refund(p_refund_id uuid, p_confirmed_by text default null::text, p_expense_payment_method text default 'cashless'::text, p_payment_order_number text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_refund public.v2_refunds%rowtype;
  v_family_name text;
  v_tx_id uuid;
  v_entry_id text;
  v_actor text := coalesce(nullif(p_confirmed_by, ''), 'CRM');
begin
  select * into v_refund from public.v2_refunds where id = p_refund_id for update;
  if not found then raise exception 'Refund not found: %', p_refund_id; end if;
  if v_refund.status <> 'pending' then raise exception 'Refund is not pending: %', v_refund.status; end if;

  select parent_name into v_family_name from public.v2_families where id = v_refund.family_id;

  v_tx_id := public.v2_add_wallet_transaction(
    v_refund.family_id, 'main', 'refund', -v_refund.amount,
    'refund', p_refund_id, v_refund.comment, v_actor
  );

  perform public.v2_settle_refund_deficit(v_refund.family_id, v_actor);

  v_entry_id := 'refund:' || p_refund_id::text;
  insert into public.v2_spending_entries(id, payload, expense_date, amount, created_by)
  values (v_entry_id, jsonb_strip_nulls(jsonb_build_object(
    'id', v_entry_id, 'category', 'OPEX', 'subcategory', 'Возврат родителю',
    'description', 'Возврат — ' || coalesce(v_family_name, v_refund.family_id),
    'recipient', coalesce(v_family_name, ''), 'date', current_date, 'amount', v_refund.amount,
    'method', case when p_expense_payment_method = 'cash' then 'Наличные' else 'Безналичные' end,
    'paymentOrderNumber', nullif(trim(p_payment_order_number), ''), 'comment', v_refund.comment,
    'familyId', v_refund.family_id, 'refundId', p_refund_id::text
  )), current_date, v_refund.amount, v_actor);

  update public.v2_refunds
    set status = 'confirmed', reviewed_by = v_actor, reviewed_at = now(),
        wallet_transaction_id = v_tx_id, spending_entry_id = v_entry_id
    where id = p_refund_id;

  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, new_value, comment)
  values (v_actor, 'confirm_refund', 'refund', p_refund_id::text,
    jsonb_build_object('amount', v_refund.amount, 'spending_entry_id', v_entry_id), 'Refund confirmed by cashier');
end;
$function$;
