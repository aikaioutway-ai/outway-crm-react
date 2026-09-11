-- Pricing formulas intentionally remain in src/utils/pricing.ts.
-- This RPC only validates and atomically applies a precomputed repricing plan.

alter table public.v2_children
  add column if not exists requested_vehicle_type text;

-- Existing child rows still contain the originally requested type. Freeze it
-- before logistics begins synchronising vehicle_type with the actual transfer.
update public.v2_children
set requested_vehicle_type = vehicle_type
where requested_vehicle_type is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'v2_children_requested_vehicle_type_check'
      and conrelid = 'public.v2_children'::regclass
  ) then
    alter table public.v2_children
      add constraint v2_children_requested_vehicle_type_check
      check (requested_vehicle_type is null or requested_vehicle_type in ('microbus', 'minivan', 'sedan'));
  end if;
end $$;

create or replace function public.v2_preserve_requested_vehicle_type()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.requested_vehicle_type is not null
    and new.requested_vehicle_type is distinct from old.requested_vehicle_type then
    raise exception 'requested_vehicle_type is immutable after child creation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_v2_children_preserve_requested_vehicle_type on public.v2_children;
create trigger trg_v2_children_preserve_requested_vehicle_type
before update of requested_vehicle_type on public.v2_children
for each row execute function public.v2_preserve_requested_vehicle_type();

alter table public.v2_charges
  add column if not exists pricing_managed boolean not null default false;

-- Only untouched charges that exactly originated from the child's current
-- price are opted into automatic repricing. Manually adjusted charges stay out.
update public.v2_charges charge
set pricing_managed = true
from public.v2_children child
where charge.child_id = child.id
  and charge.adjusted_at is null
  and charge.original_amount = child.final_price;

alter table public.v2_wallet_transactions
  drop constraint if exists v2_wallet_transactions_transaction_type_check;

alter table public.v2_wallet_transactions
  add constraint v2_wallet_transactions_transaction_type_check
  check (transaction_type in (
    'payment_confirmed', 'payment_reversed', 'payment_cancelled', 'charge_writeoff', 'deposit_writeoff',
    'deposit_topup', 'adjustment_refund', 'manual_adjustment', 'refund',
    'refund_cancelled', 'transfer_repricing'
  ));

create unique index if not exists uq_v2_audit_transfer_reprice_operation_child
  on public.v2_audit_log ((new_value ->> 'operation_id'), entity_id)
  where action = 'transfer_reprice' and new_value ? 'operation_id';

create or replace function public.v2_apply_transfer_repricing(p_plan jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
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
  v_wallet_type text;
  v_wallet_delta numeric(12,2);
  v_balance numeric(12,2);
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

  -- Lock child and charge rows in stable order before applying any updates.
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
        final_price = (v_child_plan ->> 'newFinalPrice')::numeric,
        manual_discount_percent = (v_child_plan ->> 'manualDiscountPercent')::numeric,
        manual_discount_amount = (v_child_plan ->> 'manualDiscountAmount')::numeric,
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

      v_wallet_delta := greatest(v_charge.paid_amount - (v_charge_plan ->> 'newAmount')::numeric, 0)
        - greatest(v_charge.paid_amount - v_charge.amount, 0);
      v_wallet_type := case when v_charge.charge_type in ('deposit', 'may') then 'deposit' else 'main' end;

      update public.v2_charges
      set original_amount = (v_charge_plan ->> 'newOriginalAmount')::numeric,
          amount = (v_charge_plan ->> 'newAmount')::numeric,
          status = case
            when paid_amount <= 0 then 'unpaid'
            when paid_amount < (v_charge_plan ->> 'newAmount')::numeric then 'partial'
            when paid_amount = (v_charge_plan ->> 'newAmount')::numeric then 'paid'
            else 'overpaid'
          end,
          adjusted_by = v_actor_name,
          adjusted_at = now(),
          adjustment_reason = 'Automatic transfer repricing ' || v_operation_id::text,
          updated_at = now()
      where id = v_charge.id;

      if v_wallet_delta <> 0 then
        insert into public.v2_family_wallets(family_id) values (v_child.family_id)
        on conflict (family_id) do nothing;

        if v_wallet_type = 'deposit' then
          update public.v2_family_wallets
          set deposit_balance = deposit_balance + v_wallet_delta, updated_at = now()
          where family_id = v_child.family_id
          returning deposit_balance into v_balance;
        else
          update public.v2_family_wallets
          set main_balance = main_balance + v_wallet_delta, updated_at = now()
          where family_id = v_child.family_id
          returning main_balance into v_balance;
        end if;

        insert into public.v2_wallet_transactions(
          family_id, wallet_type, transaction_type, amount, balance_after,
          source_type, source_id, comment, created_by
        ) values (
          v_child.family_id, v_wallet_type, 'transfer_repricing', v_wallet_delta, v_balance,
          'transfer_repricing', v_operation_id,
          'Automatic transfer repricing for charge ' || v_charge.id::text, v_actor_name
        );
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
        'old_final_price', (v_child_plan ->> 'oldFinalPrice')::numeric,
        'new_final_price', (v_child_plan ->> 'newFinalPrice')::numeric,
        'old_charge_amount', nullif(v_child_plan -> 'charges' -> 0 ->> 'oldAmount', '')::numeric,
        'new_charge_amount', nullif(v_child_plan -> 'charges' -> 0 ->> 'newAmount', '')::numeric,
        'paid_amount', nullif(v_child_plan -> 'charges' -> 0 ->> 'paidAmount', '')::numeric,
        'charges', coalesce(v_child_plan -> 'charges', '[]'::jsonb),
        'user_id', v_actor_id,
        'source', v_source,
        'created_at', now()
      ),
      format('Transfer #%s: %s -> %s', p_plan ->> 'transferNumber', v_child_plan ->> 'previousVehicleType', v_new_vehicle_type)
    );
    v_children_count := v_children_count + 1;
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
$$;

revoke all on function public.v2_apply_transfer_repricing(jsonb) from public;
grant execute on function public.v2_apply_transfer_repricing(jsonb) to anon, authenticated;
