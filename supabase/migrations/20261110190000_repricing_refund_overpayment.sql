-- Пересчёт цены при смене трансфера: если начисление подешевело ниже уже оплаченного,
-- оплата по начислению уменьшается до новой цены, а разница возвращается в основной кошелёк
-- и сразу распределяется на неоплаченные месяцы.
--
-- Раньше разница зачислялась в кошелёк, но «оплачено» у начисления оставалось прежним:
-- деньги учитывались дважды, а переплата депозита застревала в депозитном кошельке
-- (он погашает только депозит) и не доходила до месяцев.

create or replace function public.v2_apply_transfer_repricing(p_plan jsonb)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_operation_id uuid := (p_plan ->> 'operationId')::uuid;
  v_transfer_id uuid := (p_plan ->> 'transferId')::uuid;
  v_old_transfer_type text := p_plan ->> 'previousTransferVehicleType';
  v_new_vehicle_type text := p_plan ->> 'newVehicleType';
  v_update_transfer boolean := coalesce((p_plan ->> 'updateTransferType')::boolean, true);
  v_source text := p_plan ->> 'source';
  v_actor_id text := nullif(p_plan ->> 'actorId', '');
  v_actor_name text := coalesce(nullif(p_plan ->> 'actorName', ''), 'CRM');
  v_transfer public.v2_transfers%rowtype;
  v_child_plan jsonb;
  v_charge_plan jsonb;
  v_comment jsonb;
  v_child public.v2_children%rowtype;
  v_charge public.v2_charges%rowtype;
  v_refund numeric(12,2);
  v_balance numeric(12,2);
  v_new_paid numeric(12,2);
  v_new_original numeric(12,2);
  v_new_amount numeric(12,2);
  v_family_ids text[] := '{}';
  v_family_id text;
  v_children_count integer := 0;
  v_charges_count integer := 0;
begin
  if v_new_vehicle_type not in ('microbus', 'minivan', 'sedan') then
    raise exception 'Invalid vehicle type: %', v_new_vehicle_type;
  end if;
  if v_source not in ('logistics', 'family_card', 'map', 'transfer_move', 'vehicle_assignment') then
    raise exception 'Invalid repricing source: %', v_source;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_operation_id::text, 0));
  if exists (
    select 1 from public.v2_audit_log
    where action = 'transfer_reprice'
      and new_value ->> 'operation_id' = v_operation_id::text
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'operationId', v_operation_id);
  end if;

  select * into v_transfer
  from public.v2_transfers
  where id = v_transfer_id
  for update;
  if not found then raise exception 'Transfer not found: %', v_transfer_id; end if;
  if v_update_transfer and v_transfer.vehicle_type is distinct from v_old_transfer_type then
    raise exception 'Transfer type changed concurrently: expected %, got %', v_old_transfer_type, v_transfer.vehicle_type;
  end if;
  if not v_update_transfer and v_transfer.vehicle_type is distinct from v_new_vehicle_type then
    raise exception 'Target transfer type changed concurrently: expected %, got %', v_new_vehicle_type, v_transfer.vehicle_type;
  end if;

  if v_update_transfer and exists (
    select 1
    from public.v2_children c
    where c.transfer_id = v_transfer_id
      and c.status <> 'rejected'
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_plan -> 'children', '[]'::jsonb)) item
        where (item ->> 'id')::uuid = c.id
      )
  ) then
    raise exception 'Repricing plan does not contain every active child of transfer %', v_transfer_id;
  end if;

  perform c.id
  from public.v2_children c
  join jsonb_array_elements(coalesce(p_plan -> 'children', '[]'::jsonb)) item
    on c.id = (item ->> 'id')::uuid
  order by c.id
  for update;

  perform ch.id
  from public.v2_charges ch
  join lateral jsonb_array_elements(coalesce(p_plan -> 'children', '[]'::jsonb)) child_item on true
  join lateral jsonb_array_elements(coalesce(child_item -> 'charges', '[]'::jsonb)) charge_item
    on ch.id = (charge_item ->> 'id')::uuid
  order by ch.id
  for update;

  if v_update_transfer then
    update public.v2_transfers
    set vehicle_type = v_new_vehicle_type, updated_at = now()
    where id = v_transfer_id;
  end if;

  for v_child_plan in
    select value from jsonb_array_elements(coalesce(p_plan -> 'children', '[]'::jsonb))
    order by value ->> 'id'
  loop
    select * into v_child from public.v2_children where id = (v_child_plan ->> 'id')::uuid;
    if not found then raise exception 'Child not found: %', v_child_plan ->> 'id'; end if;
    if v_child.family_id <> v_child_plan ->> 'familyId' then
      raise exception 'Child family changed concurrently: %', v_child.id;
    end if;
    if v_child.vehicle_type is distinct from v_child_plan ->> 'previousVehicleType'
      or v_child.base_price is distinct from (v_child_plan ->> 'oldBasePrice')::numeric
      or v_child.final_price is distinct from (v_child_plan ->> 'oldFinalPrice')::numeric then
      raise exception 'Child pricing changed concurrently: %', v_child.id;
    end if;
    if v_child.transfer_id is distinct from nullif(v_child_plan ->> 'oldTransferId', '')::uuid then
      raise exception 'Child transfer changed concurrently: %', v_child.id;
    end if;

    update public.v2_children
    set requested_vehicle_type = coalesce(requested_vehicle_type, v_child_plan ->> 'requestedVehicleType'),
        vehicle_type = v_new_vehicle_type,
        transfer_id = v_transfer_id,
        base_price = (v_child_plan ->> 'newBasePrice')::numeric,
        updated_at = now()
    where id = v_child.id;

    for v_charge_plan in
      select value from jsonb_array_elements(coalesce(v_child_plan -> 'charges', '[]'::jsonb))
      order by value ->> 'id'
    loop
      select * into v_charge from public.v2_charges where id = (v_charge_plan ->> 'id')::uuid;
      if not found then raise exception 'Charge not found: %', v_charge_plan ->> 'id'; end if;
      if not v_charge.pricing_managed or v_charge.status = 'cancelled' then
        raise exception 'Charge is not pricing-managed: %', v_charge.id;
      end if;
      if v_charge.child_id <> v_child.id
        or v_charge.amount is distinct from (v_charge_plan ->> 'oldAmount')::numeric
        or v_charge.original_amount is distinct from (v_charge_plan ->> 'oldOriginalAmount')::numeric
        or v_charge.paid_amount is distinct from (v_charge_plan ->> 'paidAmount')::numeric then
        raise exception 'Charge changed concurrently: %', v_charge.id;
      end if;

      v_new_original := public.v2_child_period_price(v_child.id, v_charge.period_month, v_charge.period_year);
      v_new_amount := greatest(v_new_original - coalesce((
        select sum(d.amount) from public.v2_charge_discounts d
        where d.charge_id = v_charge.id and d.cancelled_at is null
      ), 0), 0);

      -- Возвращаем только реально распределённую на начисление сумму (не больше старой цены).
      v_new_paid := least(v_charge.paid_amount, v_new_amount);
      v_refund := greatest(least(v_charge.paid_amount, v_charge.amount) - v_new_amount, 0);

      update public.v2_charges
      set original_amount = v_new_original,
          amount = v_new_amount,
          paid_amount = v_new_paid,
          status = case
            when v_new_paid <= 0 then 'unpaid'
            when v_new_paid < v_new_amount then 'partial'
            else 'paid'
          end,
          adjusted_by = v_actor_name,
          adjusted_at = now(),
          adjustment_reason = 'Automatic transfer repricing ' || v_operation_id::text,
          updated_at = now()
      where id = v_charge.id;

      -- Переплата (в т.ч. по депозиту) идёт в основной кошелёк, чтобы погасить месяцы.
      if v_refund > 0 then
        insert into public.v2_family_wallets(family_id) values (v_child.family_id)
        on conflict (family_id) do nothing;

        update public.v2_family_wallets
        set main_balance = main_balance + v_refund, updated_at = now()
        where family_id = v_child.family_id
        returning main_balance into v_balance;

        insert into public.v2_wallet_transactions(
          family_id, wallet_type, transaction_type, amount, balance_after,
          source_type, source_id, comment, created_by
        ) values (
          v_child.family_id, 'main', 'transfer_repricing', v_refund, v_balance,
          'transfer_repricing', v_operation_id,
          'Automatic transfer repricing for charge ' || v_charge.id::text, v_actor_name
        );
      end if;

      if not v_child.family_id = any(v_family_ids) then
        v_family_ids := array_append(v_family_ids, v_child.family_id);
      end if;
      v_charges_count := v_charges_count + 1;
    end loop;

    insert into public.v2_audit_log(
      actor_id, actor_name, action, entity_type, entity_id, old_value, new_value, comment
    ) values (
      v_actor_id, v_actor_name, 'transfer_reprice', 'child', v_child.id::text,
      jsonb_build_object(
        'transfer_id', v_child.transfer_id,
        'vehicle_type', v_child.vehicle_type,
        'base_price', v_child.base_price,
        'final_price', v_child.final_price
      ),
      jsonb_build_object(
        'operation_id', v_operation_id,
        'child_id', v_child.id,
        'family_id', v_child.family_id,
        'transfer_id', v_transfer_id,
        'requested_vehicle_type', coalesce(v_child.requested_vehicle_type, v_child_plan ->> 'requestedVehicleType'),
        'previous_vehicle_type', v_child_plan ->> 'previousVehicleType',
        'new_vehicle_type', v_new_vehicle_type,
        'old_base_price', (v_child_plan ->> 'oldBasePrice')::numeric,
        'new_base_price', (v_child_plan ->> 'newBasePrice')::numeric,
        'old_final_price', v_child.final_price,
        'new_final_price', (select final_price from public.v2_children where id = v_child.id),
        'charges', coalesce(v_child_plan -> 'charges', '[]'::jsonb),
        'user_id', v_actor_id,
        'source', v_source,
        'created_at', now()
      ),
      format('Transfer #%s: %s -> %s', p_plan ->> 'transferNumber', v_child_plan ->> 'previousVehicleType', v_new_vehicle_type)
    );
    v_children_count := v_children_count + 1;
  end loop;

  -- После изменения цен распределяем свободные деньги кошельков на неоплаченные начисления.
  foreach v_family_id in array v_family_ids loop
    perform public.v2_apply_wallet_to_charges(v_family_id, 'deposit', v_actor_name);
    perform public.v2_apply_wallet_to_charges(v_family_id, 'main', v_actor_name);
  end loop;

  for v_comment in
    select value from jsonb_array_elements(coalesce(p_plan -> 'familyComments', '[]'::jsonb))
    order by value ->> 'familyId'
  loop
    update public.v2_families
    set comment = concat_ws(E'\n', nullif(comment, ''), v_comment ->> 'text'),
        updated_at = now()
    where id = v_comment ->> 'familyId';
  end loop;

  insert into public.v2_audit_log(
    actor_id, actor_name, action, entity_type, entity_id, old_value, new_value, comment
  ) values (
    v_actor_id, v_actor_name, 'transfer_reprice', 'transfer', v_transfer_id::text,
    jsonb_build_object('vehicle_type', v_old_transfer_type),
    jsonb_build_object(
      'operation_id', v_operation_id,
      'transfer_id', v_transfer_id,
      'previous_vehicle_type', v_old_transfer_type,
      'new_vehicle_type', v_new_vehicle_type,
      'source', v_source,
      'created_at', now()
    ),
    format('Transfer #%s: %s -> %s', p_plan ->> 'transferNumber', coalesce(v_old_transfer_type, '—'), v_new_vehicle_type)
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'operationId', v_operation_id,
    'childrenUpdated', v_children_count,
    'chargesUpdated', v_charges_count
  );
end;
$function$;
