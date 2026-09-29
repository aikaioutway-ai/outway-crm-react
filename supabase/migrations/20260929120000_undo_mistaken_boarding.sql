-- Ошибочная посадка.
--
-- Если ребёнку поставили «Посажен» по ошибке и вернули «Новый» или «Ожидание»,
-- все начисления, созданные с момента посадки (месяц, депозит, крон), отменяются:
-- сумма обнуляется (исходная остаётся в original_amount), оплата возвращается
-- на баланс, свободный депозит — обратно на основной баланс.
-- Повторная посадка восстанавливает отменённые начисления.
-- «Пауза» и «Отказ» начисления не трогают — ребёнок фактически ездил.

alter table public.v2_children add column if not exists boarded_at timestamptz;

-- Момент посадки для уже посаженных детей.
update public.v2_children c
set boarded_at = coalesce(
  (select max(a.created_at) from public.v2_audit_log a
   where a.action = 'charge_on_boarding' and a.entity_id = c.id::text),
  (select min(ch.created_at) from public.v2_charges ch where ch.child_id = c.id),
  c.updated_at
)
where c.status = 'boarded' and c.boarded_at is null;

-- boarded_at ставит только база; браузер не может его подделать.
create or replace function public.v2_children_pricing_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if coalesce(new.manual_discount_percent, 0) <> 0
        or coalesce(new.manual_discount_amount, 0) <> 0
        or new.fixed_price is not null
        or new.discount_valid_from is not null
        or new.discount_valid_to is not null then
        raise exception 'Скидку может назначить только директор, гендиректор или администратор';
      end if;
    elsif (new.manual_discount_percent, new.manual_discount_amount, new.fixed_price,
           new.discount_valid_from, new.discount_valid_to, new.discount_reason,
           new.discount_approved_by, new.sibling_discount_percent)
      is distinct from
          (old.manual_discount_percent, old.manual_discount_amount, old.fixed_price,
           old.discount_valid_from, old.discount_valid_to, old.discount_reason,
           old.discount_approved_by, old.sibling_discount_percent) then
      raise exception 'Скидку может изменить только директор, гендиректор или администратор';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.boarded_at := case when new.status = 'boarded' then now() else null end;
  elsif new.status = 'boarded' and old.status is distinct from 'boarded' then
    new.boarded_at := now();
  else
    new.boarded_at := old.boarded_at;
  end if;

  new.sibling_applied := public.v2_child_sibling_eligible(
    new.family_id, new.id, new.status, new.sibling_discount_percent, new.created_at
  );
  new.final_price := public.v2_calc_child_price(
    new.base_price, new.fixed_price, new.manual_discount_percent, new.manual_discount_amount,
    new.discount_valid_from, new.discount_valid_to, new.sibling_applied,
    date_trunc('month', current_date)::date
  );
  return new;
end;
$$;

-- Свободные деньги депозита (сверх неоплаченных депозита и мая) — обратно на основной баланс.
create or replace function public.v2_release_deposit_surplus(p_family_id text, p_actor text default 'CRM')
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deposit numeric;
  v_need numeric;
  v_move numeric;
begin
  select greatest(deposit_balance, 0) into v_deposit
  from public.v2_family_wallets where family_id = p_family_id for update;
  if coalesce(v_deposit, 0) <= 0 then return 0; end if;

  select coalesce(sum(amount - paid_amount), 0) into v_need
  from public.v2_charges
  where family_id = p_family_id and charge_type in ('deposit', 'may')
    and status <> 'cancelled' and amount > paid_amount;

  v_move := v_deposit - v_need;
  if v_move <= 0 then return 0; end if;

  perform public.v2_add_wallet_transaction(p_family_id, 'deposit', 'deposit_transfer', -v_move,
    'deposit_transfer', null, 'Возврат с депозита на баланс', p_actor);
  perform public.v2_add_wallet_transaction(p_family_id, 'main', 'deposit_transfer', v_move,
    'deposit_transfer', null, 'Возврат с депозита на баланс', p_actor);
  return v_move;
end;
$$;

create or replace function public.v2_cancel_child_boarding_charges(p_child_id uuid, p_since timestamptz, p_actor text default 'CRM')
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.v2_children%rowtype;
  v_charge public.v2_charges%rowtype;
  v_count int := 0;
  v_refunded numeric := 0;
begin
  select * into v_child from public.v2_children where id = p_child_id;
  if not found or p_since is null then return 0; end if;

  for v_charge in
    select * from public.v2_charges
    where child_id = p_child_id and status <> 'cancelled' and created_at >= p_since
    order by created_at
    for update
  loop
    if v_charge.paid_amount > 0 then
      perform public.v2_add_wallet_transaction(
        v_charge.family_id,
        case when v_charge.charge_type in ('deposit', 'may') then 'deposit' else 'main' end,
        'adjustment_refund', v_charge.paid_amount, 'charge', v_charge.id,
        'Отмена ошибочной посадки', p_actor
      );
      v_refunded := v_refunded + v_charge.paid_amount;
    end if;

    update public.v2_charges
    set amount = 0,
        paid_amount = 0,
        status = 'cancelled',
        adjusted_by = p_actor,
        adjusted_at = now(),
        adjustment_reason = 'Отмена посадки'
    where id = v_charge.id;
    v_count := v_count + 1;
  end loop;

  if v_count > 0 then
    perform public.v2_release_deposit_surplus(v_child.family_id, p_actor);
    perform public.v2_fund_deposit_from_main(v_child.family_id, p_actor);
    perform public.v2_apply_wallet_to_charges(v_child.family_id, 'deposit', p_actor);
    perform public.v2_apply_wallet_to_charges(v_child.family_id, 'main', p_actor);

    insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, new_value, comment)
    values (p_actor, 'cancel_boarding_charges', 'child', p_child_id::text,
      jsonb_build_object('cancelled', v_count, 'refunded', v_refunded, 'since', p_since),
      'Отмена начислений ошибочной посадки');
  end if;
  return v_count;
end;
$$;

-- Посадка: отменённые ранее начисления того же периода восстанавливаются.
create or replace function public.v2_charge_child_on_boarding(p_child_id uuid, p_actor text default 'CRM')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.v2_children%rowtype;
  v_month int := extract(month from current_date)::int;
  v_year int := extract(year from current_date)::int;
  v_academic boolean;
  v_price_month int;
  v_deposit_year int;
  v_price numeric;
begin
  select * into v_child from public.v2_children where id = p_child_id;
  if not found or v_child.status <> 'boarded' then return; end if;

  v_academic := v_month in (1, 2, 3, 4, 5, 9, 10, 11, 12);
  v_price_month := case when v_academic then v_month else 9 end;
  v_deposit_year := case when v_month >= 6 then v_year + 1 else v_year end;
  v_price := public.v2_child_period_price(v_child.id, v_price_month, v_year);

  if v_price > 0 and not exists (
    select 1 from public.v2_charges
    where child_id = v_child.id and charge_type = 'deposit' and period_year = v_deposit_year
      and status <> 'cancelled'
  ) then
    insert into public.v2_charges(family_id, child_id, period_month, period_year, charge_type,
      original_amount, amount, paid_amount, pricing_managed, status)
    values (v_child.family_id, v_child.id, 5, v_deposit_year, 'deposit', v_price, v_price, 0, true, 'unpaid')
    on conflict (child_id, period_month, period_year, charge_type) do update
      set original_amount = excluded.original_amount, amount = excluded.amount, paid_amount = 0,
          status = 'unpaid', created_at = now(), adjusted_by = p_actor, adjusted_at = now(),
          adjustment_reason = 'Повторная посадка'
      where public.v2_charges.status = 'cancelled';
  end if;

  if v_academic and v_price > 0 and not (v_month = 5 and exists (
    select 1 from public.v2_charges
    where child_id = v_child.id and charge_type = 'deposit' and period_year = v_year and status <> 'cancelled'
  )) then
    insert into public.v2_charges(family_id, child_id, period_month, period_year, charge_type,
      original_amount, amount, paid_amount, pricing_managed, status)
    values (v_child.family_id, v_child.id, v_month, v_year,
      case when v_month = 5 then 'may' else 'monthly' end, v_price, v_price, 0, true, 'unpaid')
    on conflict (child_id, period_month, period_year, charge_type) do update
      set original_amount = excluded.original_amount, amount = excluded.amount, paid_amount = 0,
          status = 'unpaid', created_at = now(), adjusted_by = p_actor, adjusted_at = now(),
          adjustment_reason = 'Повторная посадка'
      where public.v2_charges.status = 'cancelled';
  end if;

  perform public.v2_fund_deposit_from_main(v_child.family_id, p_actor);
  perform public.v2_apply_wallet_to_charges(v_child.family_id, 'deposit', p_actor);
  perform public.v2_apply_wallet_to_charges(v_child.family_id, 'main', p_actor);

  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, new_value, comment)
  values (p_actor, 'charge_on_boarding', 'child', v_child.id::text,
    jsonb_build_object('month', v_month, 'year', v_year, 'price', v_price, 'deposit_year', v_deposit_year),
    'Начисление при посадке');
end;
$$;

create or replace function public.v2_children_charge_on_boarding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'boarded' and (tg_op = 'INSERT' or old.status is distinct from 'boarded') then
    perform public.v2_charge_child_on_boarding(new.id, 'CRM');
  elsif tg_op = 'UPDATE' and old.status = 'boarded' and new.status in ('new', 'waiting') then
    perform public.v2_cancel_child_boarding_charges(new.id, old.boarded_at, 'CRM');
  end if;
  return null;
end;
$$;

revoke all on function public.v2_release_deposit_surplus(text, text) from public, anon, authenticated;
revoke all on function public.v2_cancel_child_boarding_charges(uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.v2_charge_child_on_boarding(uuid, text) from public, anon, authenticated;
grant execute on function public.v2_release_deposit_surplus(text, text) to service_role;
grant execute on function public.v2_cancel_child_boarding_charges(uuid, timestamptz, text) to service_role;
grant execute on function public.v2_charge_child_on_boarding(uuid, text) to service_role;

notify pgrst, 'reload schema';
