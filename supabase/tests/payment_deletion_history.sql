-- Integration checks in one rolled-back transaction. No customer data is changed.
begin;
do $$
declare
  v_actor text;
  v_family text := 'qa-payment-delete-' || gen_random_uuid()::text;
  v_payment uuid;
  v_bank uuid;
  v_driver uuid;
  v_advance uuid;
  v_status text;
  v_receipt text := 'https://example.com/qa-receipt.png';
  v_denied boolean;
begin
  select id into v_actor from public.v2_employees where status = 'active' and role = 'admin' limit 1;
  if v_actor is null then raise exception 'QA requires an active admin'; end if;
  insert into public.v2_families(id, parent_name, phone) values(v_family, 'QA rollback only', 'qa');
  foreach v_status in array array['pending','rejected','cancelled','confirmed'] loop
    insert into public.v2_payments(family_id, amount, payment_method, payment_date, status, receipt_url, comment)
    values(v_family, 500, 'transfer', current_date, case when v_status = 'confirmed' then 'pending' else v_status end, v_receipt, 'QA rollback only') returning id into v_payment;
    if v_status = 'confirmed' then
      perform public.v2_confirm_payment(v_payment, 500, 0, 'QA', current_date);
    end if;
    insert into public.bank_statements(receipt_code, amount, statement_date, matched_payment_id)
    values('qa-' || v_payment::text, 500, current_date, v_payment) returning id into v_bank;

    v_denied := false;
    begin
      perform public.v2_delete_payment_with_history(v_payment, 'nonexistent-qa-actor');
    exception when others then v_denied := true;
    end;
    if not v_denied then raise exception 'Unauthorized deletion was allowed'; end if;
    if not exists(select 1 from public.v2_payments where id = v_payment) then raise exception 'Unauthorized deletion changed payment'; end if;

    perform public.v2_delete_payment_with_history(v_payment, v_actor);
    if exists(select 1 from public.v2_payments where id = v_payment) then raise exception 'Payment remains in live list'; end if;
    if not exists(select 1 from public.v2_audit_log where entity_id = v_family and action = 'payment_delete'
      and old_value->'payment'->>'id' = v_payment::text
      and old_value->'payment'->>'status' = v_status
      and old_value->'payment'->>'receipt_url' = v_receipt) then raise exception 'Original payment/receipt was not archived'; end if;
    if not exists(select 1 from public.bank_statements where id = v_bank and matched_payment_id is null and match_status = 'unmatched') then raise exception 'Bank reconciliation was not reset'; end if;
    if coalesce((select sum(amount) from public.v2_wallet_transactions where family_id = v_family),0) <> 0 then raise exception 'Balance was not reversed'; end if;
    v_denied := false;
    begin
      perform public.v2_delete_payment_with_history(v_payment, v_actor);
    exception when others then v_denied := true;
    end;
    if not v_denied then raise exception 'Repeated deletion was allowed'; end if;
  end loop;
  if (select count(*) from public.v2_audit_log where entity_id = v_family and action = 'payment_delete') <> 4 then raise exception 'Unexpected history count'; end if;

  insert into public.v2_drivers(full_name, phone) values('QA rollback only', 'qa') returning id into v_driver;
  insert into public.v2_driver_advances(driver_id,amount,date,payment_method,payment_order_number,period_month,period_year)
  values(v_driver,100,current_date,'cash','QA',9,2026) returning id into v_advance;
  if not exists(select 1 from public.v2_driver_advances where id=v_advance and period_month=9 and period_year=2026 and payment_method='cash' and payment_order_number='QA') then raise exception 'Driver advance lost payroll period or payment details'; end if;
  insert into public.v2_driver_advances(driver_id,amount,date) values(v_driver,100,date '2026-08-30') returning id into v_advance;
  if not exists(select 1 from public.v2_driver_advances where id=v_advance and period_month=8 and period_year=2026) then raise exception 'Legacy advance default period is incorrect'; end if;
  if has_function_privilege('anon','public.v2_delete_payment_with_history(uuid,text)','execute') or has_function_privilege('authenticated','public.v2_delete_payment_with_history(uuid,text)','execute') then raise exception 'Public role can bypass employee session'; end if;
end;
$$;
select 'PASS: four payment states, history, bank reconciliation, balance reversal, authorization, repeated deletion, driver advances' as result;
rollback;
