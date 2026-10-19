-- Keep assignment and payment details with the advance, even after a driver moves.
alter table public.v2_driver_advances
  add column if not exists school_key text,
  add column if not exists transfer_id uuid references public.v2_transfers(id) on delete set null,
  add column if not exists period_month integer check (period_month between 1 and 12),
  add column if not exists period_year integer check (period_year between 2020 and 2200),
  add column if not exists payment_method text not null default 'cashless' check (payment_method in ('cash', 'cashless')),
  add column if not exists payment_order_number text;

update public.v2_driver_advances
set period_month = extract(month from date)::integer,
    period_year = extract(year from date)::integer
where period_month is null or period_year is null;

-- Legacy callers omit payroll period: use the payment month in that case.
create or replace function public.v2_driver_advance_default_period()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.period_month := coalesce(new.period_month, extract(month from new.date)::integer);
  new.period_year := coalesce(new.period_year, extract(year from new.date)::integer);
  return new;
end;
$$;
create trigger v2_driver_advance_default_period
before insert on public.v2_driver_advances
for each row execute function public.v2_driver_advance_default_period();

-- One transaction archives the original payment, reverses confirmed money,
-- detaches bank reconciliation and removes the live payment. Any error rolls back all.
create or replace function public.v2_delete_payment_with_history(p_payment_id uuid, p_actor_id text)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_payment public.v2_payments%rowtype;
  v_actor public.v2_employees%rowtype;
  v_bank_matches jsonb;
begin
  -- Callable only by service_role via the signed employee-session Edge Function.
  select * into v_actor from public.v2_employees where id = p_actor_id;
  if not found or v_actor.status <> 'active' or v_actor.role not in ('admin', 'gen_director', 'cashier') then
    raise exception 'Нет доступа к удалению платежей';
  end if;
  select * into v_payment from public.v2_payments where id = p_payment_id for update;
  if not found then raise exception 'Платёж уже удалён или не найден'; end if;

  select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into v_bank_matches
    from public.bank_statements b where b.matched_payment_id = p_payment_id;

  insert into public.v2_audit_log(actor_id, actor_name, actor_role, action, entity_type, entity_id, old_value, new_value, comment)
  values (v_actor.id, v_actor.full_name, v_actor.role, 'payment_delete', 'payment', v_payment.family_id,
    jsonb_build_object('payment', to_jsonb(v_payment), 'bank_matches', v_bank_matches),
    jsonb_build_object('deleted_payment_id', p_payment_id), 'Платёж и чек удалены из рабочего списка; оригинал сохранён в истории');

  if v_payment.status = 'confirmed' then
    perform public.v2_cancel_payment(p_payment_id, 'Удаление платежа с сохранением истории', v_actor.full_name);
  end if;
  update public.bank_statements set matched_payment_id = null, match_status = 'unmatched' where matched_payment_id = p_payment_id;
  delete from public.v2_payments where id = p_payment_id;
end;
$$;
revoke all on function public.v2_delete_payment_with_history(uuid, text) from public, anon, authenticated;
grant execute on function public.v2_delete_payment_with_history(uuid, text) to service_role;
notify pgrst, 'reload schema';

-- Payroll payouts must subtract advances for the selected salary month,
-- including advances paid in a different calendar month. Preserve both overloads.
do $$
declare v_function record; v_source text;
begin
  for v_function in select oid from pg_proc where pronamespace = 'public'::regnamespace
    and proname = 'v2_record_payroll_payments' and prokind = 'f'
  loop
    v_source := pg_get_functiondef(v_function.oid);
    v_source := replace(v_source,
      'advance.date >= make_date(p_period_year, p_period_month, 1)',
      'coalesce(advance.period_month, extract(month from advance.date)::integer) = p_period_month');
    v_source := replace(v_source,
      'advance.date < make_date(p_period_year, p_period_month, 1) + interval ''1 month''',
      'coalesce(advance.period_year, extract(year from advance.date)::integer) = p_period_year');
    execute v_source;
  end loop;
end;
$$;
