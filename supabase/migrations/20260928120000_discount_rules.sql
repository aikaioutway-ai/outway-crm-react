-- Правила скидок.
--
-- Постоянная скидка живёт в карточке ребёнка (процент и/или сумма, период
-- действия, причина). Ручная скидка отключает семейную 5%. Семейная 5%
-- считается автоматически: её получают все активные дети семьи, кроме
-- «первого» (активный = не отказ и не пауза). Цена учителя — фиксированная
-- цена ребёнка. Разовые скидки привязаны к конкретному начислению.
--
-- Скидки меняют только директор, гендиректор и админ — через edge-функцию
-- discount-api (service_role). Браузер (anon/authenticated) не может ни
-- изменить поля скидки, ни записать произвольную итоговую цену: final_price
-- всегда пересчитывается триггером.

alter table public.v2_children
  add column if not exists fixed_price numeric(12,2),
  add column if not exists discount_valid_from date,
  add column if not exists discount_valid_to date,
  add column if not exists discount_updated_at timestamptz,
  add column if not exists sibling_applied boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'v2_children_fixed_price_check' and conrelid = 'public.v2_children'::regclass) then
    alter table public.v2_children add constraint v2_children_fixed_price_check check (fixed_price is null or fixed_price >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'v2_children_discount_period_check' and conrelid = 'public.v2_children'::regclass) then
    alter table public.v2_children add constraint v2_children_discount_period_check
      check (discount_valid_from is null or discount_valid_to is null or discount_valid_from <= discount_valid_to);
  end if;
end $$;

-- Разовые скидки на начисление -----------------------------------------------

create table if not exists public.v2_charge_discounts (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references public.v2_charges(id) on delete cascade,
  family_id text not null references public.v2_families(id) on delete cascade,
  child_id uuid not null references public.v2_children(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  reason_type text not null check (reason_type in ('partial_month', 'recalculation', 'compensation', 'other')),
  comment text,
  created_by text,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by text
);

create index if not exists idx_v2_charge_discounts_charge on public.v2_charge_discounts(charge_id) where cancelled_at is null;
create index if not exists idx_v2_charge_discounts_family on public.v2_charge_discounts(family_id, created_at desc);

alter table public.v2_charge_discounts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'v2_charge_discounts' and policyname = 'v2 anon read') then
    create policy "v2 anon read" on public.v2_charge_discounts for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'v2_charge_discounts' and policyname = 'v2 authenticated read') then
    create policy "v2 authenticated read" on public.v2_charge_discounts for select to authenticated using (true);
  end if;
end $$;

revoke insert, update, delete on public.v2_charge_discounts from anon, authenticated;

-- Расчёт цены -----------------------------------------------------------------

create or replace function public.v2_calc_child_price(
  p_base numeric,
  p_fixed numeric,
  p_manual_percent numeric,
  p_manual_amount numeric,
  p_valid_from date,
  p_valid_to date,
  p_sibling boolean,
  p_period date
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_base numeric := greatest(coalesce(p_base, 0), 0);
  v_manual boolean;
  v_percent numeric;
  v_percent_amount numeric;
  v_amount numeric := 0;
begin
  if p_fixed is not null then
    return p_fixed;
  end if;

  v_manual := (coalesce(p_manual_percent, 0) > 0 or coalesce(p_manual_amount, 0) > 0)
    and (p_valid_from is null or p_period >= p_valid_from)
    and (p_valid_to is null or p_period <= p_valid_to);

  v_percent := case
    when v_manual then coalesce(p_manual_percent, 0)
    when p_sibling then 5
    else 0
  end;
  v_percent_amount := round(v_base * v_percent / 100);
  if v_manual then
    v_amount := least(coalesce(p_manual_amount, 0), greatest(v_base - v_percent_amount, 0));
  end if;
  return greatest(v_base - v_percent_amount - v_amount, 0);
end;
$$;

-- Семейная 5%: ребёнок активен и в семье есть другой активный ребёнок, который
-- стоит раньше него. «Первым» считается ребёнок без отметки семейной скидки,
-- при равенстве — более ранний.
create or replace function public.v2_child_sibling_eligible(
  p_family_id text,
  p_child_id uuid,
  p_status text,
  p_sibling_mark numeric,
  p_created_at timestamptz
)
returns boolean
language sql
volatile
set search_path = public
as $$
  select p_status in ('new', 'waiting', 'boarded')
    and exists (
      select 1
      from public.v2_children other
      where other.family_id = p_family_id
        and other.id <> p_child_id
        and other.status in ('new', 'waiting', 'boarded')
        and (other.sibling_discount_percent, other.created_at, other.id)
          < (coalesce(p_sibling_mark, 0), p_created_at, p_child_id)
    );
$$;

create or replace function public.v2_child_period_price(p_child_id uuid, p_month int, p_year int)
returns numeric
language sql
volatile
set search_path = public
as $$
  select public.v2_calc_child_price(
    c.base_price, c.fixed_price, c.manual_discount_percent, c.manual_discount_amount,
    c.discount_valid_from, c.discount_valid_to,
    public.v2_child_sibling_eligible(c.family_id, c.id, c.status, c.sibling_discount_percent, c.created_at),
    make_date(p_year, p_month, 1)
  )
  from public.v2_children c
  where c.id = p_child_id;
$$;

-- Защита и пересчёт цены ребёнка ----------------------------------------------

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

drop trigger if exists trg_v2_children_pricing_guard on public.v2_children;
create trigger trg_v2_children_pricing_guard
before insert or update on public.v2_children
for each row execute function public.v2_children_pricing_guard();

-- Статус одного ребёнка влияет на семейную скидку остальных детей семьи.
create or replace function public.v2_children_refresh_family_prices()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.v2_children
    set final_price = final_price
    where family_id = old.family_id and id <> old.id;
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.family_id is distinct from old.family_id) then
    update public.v2_children
    set final_price = final_price
    where family_id = new.family_id and id <> new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_v2_children_refresh_family_prices on public.v2_children;
create trigger trg_v2_children_refresh_family_prices
after insert or delete or update of status, family_id, sibling_discount_percent on public.v2_children
for each row execute function public.v2_children_refresh_family_prices();

-- Пересчитать текущие цены всех детей (срок скидок мог истечь).
create or replace function public.v2_refresh_child_prices()
returns void
language sql
security definer
set search_path = public
as $$
  update public.v2_children set final_price = final_price;
$$;

-- Постоянная скидка / фиксированная цена ---------------------------------------

create or replace function public.v2_set_child_discount(
  p_child_id uuid,
  p_percent numeric,
  p_amount numeric,
  p_valid_from date,
  p_valid_to date,
  p_reason text,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.v2_children%rowtype;
  v_percent numeric := coalesce(p_percent, 0);
  v_amount numeric := coalesce(p_amount, 0);
  v_from date := date_trunc('month', p_valid_from)::date;
  v_to date := date_trunc('month', p_valid_to)::date;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_percent < 0 or v_percent > 100 or mod(v_percent, 5) <> 0 then
    raise exception 'Скидка в процентах: от 0 до 100 с шагом 5';
  end if;
  if v_amount < 0 or mod(v_amount, 100) <> 0 then
    raise exception 'Скидка суммой: не меньше 0, с шагом 100 сом';
  end if;
  if v_reason is null then
    raise exception 'Укажите причину скидки';
  end if;
  if v_from is not null and v_to is not null and v_from > v_to then
    raise exception 'Месяц окончания раньше месяца начала';
  end if;

  select * into v_child from public.v2_children where id = p_child_id for update;
  if not found then raise exception 'Ребёнок не найден: %', p_child_id; end if;

  if v_percent = 0 and v_amount = 0 then
    v_from := null;
    v_to := null;
  end if;

  update public.v2_children
  set manual_discount_percent = v_percent,
      manual_discount_amount = v_amount,
      discount_valid_from = v_from,
      discount_valid_to = v_to,
      discount_reason = v_reason,
      discount_approved_by = p_actor,
      discount_updated_at = now()
  where id = p_child_id;

  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, old_value, new_value, comment)
  values (
    p_actor, 'set_discount', 'child', p_child_id::text,
    jsonb_build_object(
      'percent', v_child.manual_discount_percent, 'amount', v_child.manual_discount_amount,
      'valid_from', v_child.discount_valid_from, 'valid_to', v_child.discount_valid_to,
      'final_price', v_child.final_price
    ),
    jsonb_build_object('percent', v_percent, 'amount', v_amount, 'valid_from', v_from, 'valid_to', v_to),
    v_reason
  );
end;
$$;

create or replace function public.v2_set_child_fixed_price(
  p_child_id uuid,
  p_fixed_price numeric,
  p_reason text,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.v2_children%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if p_fixed_price is not null and p_fixed_price < 0 then
    raise exception 'Цена не может быть отрицательной';
  end if;
  if v_reason is null then
    raise exception 'Укажите причину';
  end if;

  select * into v_child from public.v2_children where id = p_child_id for update;
  if not found then raise exception 'Ребёнок не найден: %', p_child_id; end if;

  update public.v2_children
  set fixed_price = p_fixed_price,
      discount_approved_by = p_actor,
      discount_updated_at = now()
  where id = p_child_id;

  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, old_value, new_value, comment)
  values (
    p_actor, 'set_fixed_price', 'child', p_child_id::text,
    jsonb_build_object('fixed_price', v_child.fixed_price, 'final_price', v_child.final_price),
    jsonb_build_object('fixed_price', p_fixed_price),
    v_reason
  );
end;
$$;

-- Разовые скидки ----------------------------------------------------------------

create or replace function public.v2_add_charge_discount(
  p_charge_id uuid,
  p_amount numeric,
  p_reason_type text,
  p_comment text,
  p_actor text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge public.v2_charges%rowtype;
  v_new_amount numeric(12,2);
  v_refund numeric(12,2) := 0;
  v_wallet_type text;
  v_discount_id uuid;
begin
  if p_reason_type not in ('partial_month', 'recalculation', 'compensation', 'other') then
    raise exception 'Неизвестная причина скидки: %', p_reason_type;
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Сумма скидки должна быть больше 0';
  end if;
  if p_reason_type = 'other' and nullif(trim(coalesce(p_comment, '')), '') is null then
    raise exception 'Для причины «Другое» нужен комментарий';
  end if;

  select * into v_charge from public.v2_charges where id = p_charge_id for update;
  if not found then raise exception 'Начисление не найдено: %', p_charge_id; end if;
  if v_charge.status = 'cancelled' then raise exception 'Начисление отменено'; end if;
  if p_amount > v_charge.amount then
    raise exception 'Скидка (%) больше суммы начисления (%)', p_amount, v_charge.amount;
  end if;

  v_new_amount := v_charge.amount - p_amount;
  v_wallet_type := case when v_charge.charge_type in ('deposit', 'may') then 'deposit' else 'main' end;

  insert into public.v2_charge_discounts(charge_id, family_id, child_id, amount, reason_type, comment, created_by)
  values (p_charge_id, v_charge.family_id, v_charge.child_id, p_amount, p_reason_type, nullif(trim(coalesce(p_comment, '')), ''), p_actor)
  returning id into v_discount_id;

  if v_charge.paid_amount > v_new_amount then
    v_refund := v_charge.paid_amount - v_new_amount;
  end if;

  update public.v2_charges
  set amount = v_new_amount,
      paid_amount = paid_amount - v_refund,
      adjusted_by = p_actor,
      adjusted_at = now(),
      adjustment_reason = 'Разовая скидка ' || v_discount_id::text
  where id = p_charge_id;

  if v_refund > 0 then
    perform public.v2_add_wallet_transaction(
      v_charge.family_id, v_wallet_type, 'adjustment_refund', v_refund,
      'charge', p_charge_id, 'Разовая скидка на оплаченное начисление', p_actor
    );
  end if;

  perform public.v2_refresh_charge_status(p_charge_id);

  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, old_value, new_value, comment)
  values (
    p_actor, 'add_charge_discount', 'charge', p_charge_id::text,
    jsonb_build_object('amount', v_charge.amount, 'paid_amount', v_charge.paid_amount),
    jsonb_build_object('discount_id', v_discount_id, 'discount', p_amount, 'amount', v_new_amount, 'refund', v_refund, 'reason_type', p_reason_type),
    p_comment
  );
  return v_discount_id;
end;
$$;

create or replace function public.v2_cancel_charge_discount(p_discount_id uuid, p_actor text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_discount public.v2_charge_discounts%rowtype;
  v_charge public.v2_charges%rowtype;
begin
  select * into v_discount from public.v2_charge_discounts where id = p_discount_id for update;
  if not found then raise exception 'Скидка не найдена: %', p_discount_id; end if;
  if v_discount.cancelled_at is not null then raise exception 'Скидка уже отменена'; end if;

  select * into v_charge from public.v2_charges where id = v_discount.charge_id for update;

  update public.v2_charge_discounts
  set cancelled_at = now(), cancelled_by = p_actor
  where id = p_discount_id;

  update public.v2_charges
  set amount = amount + v_discount.amount,
      adjusted_by = p_actor,
      adjusted_at = now(),
      adjustment_reason = 'Отмена разовой скидки ' || p_discount_id::text
  where id = v_discount.charge_id;

  perform public.v2_refresh_charge_status(v_discount.charge_id);
  perform public.v2_apply_wallet_to_charges(v_discount.family_id, 'main', p_actor);
  perform public.v2_apply_wallet_to_charges(v_discount.family_id, 'deposit', p_actor);

  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, old_value, new_value, comment)
  values (
    p_actor, 'cancel_charge_discount', 'charge', v_discount.charge_id::text,
    jsonb_build_object('discount_id', p_discount_id, 'discount', v_discount.amount, 'amount', v_charge.amount),
    jsonb_build_object('amount', v_charge.amount + v_discount.amount),
    'Отмена разовой скидки'
  );
end;
$$;

-- Ежемесячные начисления ---------------------------------------------------------

create or replace function public.v2_create_period_charges(p_month int, p_year int, p_created_by text default 'cron')
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_wallet_type text := case when p_month = 5 then 'deposit' else 'main' end;
begin
  if p_month not in (1, 2, 3, 4, 5, 9, 10, 11, 12) then
    raise exception 'Месяц % вне учебного сезона', p_month;
  end if;

  perform public.v2_refresh_child_prices();

  insert into public.v2_charges(
    family_id, child_id, period_month, period_year, charge_type,
    original_amount, amount, paid_amount, pricing_managed, status
  )
  select c.family_id, c.id, p_month, p_year,
    case when p_month = 5 then 'may' else 'monthly' end,
    price.value, price.value, 0, true, 'unpaid'
  from public.v2_children c
  cross join lateral (select public.v2_child_period_price(c.id, p_month, p_year) as value) price
  where c.status = 'boarded' and price.value > 0
  on conflict (child_id, period_month, period_year, charge_type) do nothing;

  get diagnostics v_count = row_count;

  perform public.v2_apply_wallet_to_charges(f.family_id, v_wallet_type, p_created_by)
  from (select distinct family_id from public.v2_children where status = 'boarded') f;

  return v_count;
end;
$$;

-- Пересчёт при смене транспорта: сумма начисления = цена за период начисления
-- минус действующие разовые скидки. Ручная скидка больше не переписывается.

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
  v_new_original numeric(12,2);
  v_new_amount numeric(12,2);
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

    -- final_price пересчитывает триггер v2_children_pricing_guard.
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

      v_wallet_delta := greatest(v_charge.paid_amount - v_new_amount, 0)
        - greatest(v_charge.paid_amount - v_charge.amount, 0);
      v_wallet_type := case when v_charge.charge_type in ('deposit', 'may') then 'deposit' else 'main' end;

      update public.v2_charges
      set original_amount = v_new_original,
          amount = v_new_amount,
          status = case
            when paid_amount <= 0 then 'unpaid'
            when paid_amount < v_new_amount then 'partial'
            when paid_amount = v_new_amount then 'paid'
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

-- Права ----------------------------------------------------------------------

revoke all on function public.v2_refresh_child_prices() from public, anon, authenticated;
revoke all on function public.v2_set_child_discount(uuid, numeric, numeric, date, date, text, text) from public, anon, authenticated;
revoke all on function public.v2_set_child_fixed_price(uuid, numeric, text, text) from public, anon, authenticated;
revoke all on function public.v2_add_charge_discount(uuid, numeric, text, text, text) from public, anon, authenticated;
revoke all on function public.v2_cancel_charge_discount(uuid, text) from public, anon, authenticated;
revoke all on function public.v2_create_period_charges(int, int, text) from public, anon, authenticated;
grant execute on function public.v2_refresh_child_prices() to service_role;
grant execute on function public.v2_set_child_discount(uuid, numeric, numeric, date, date, text, text) to service_role;
grant execute on function public.v2_set_child_fixed_price(uuid, numeric, text, text) to service_role;
grant execute on function public.v2_add_charge_discount(uuid, numeric, text, text, text) to service_role;
grant execute on function public.v2_cancel_charge_discount(uuid, text) to service_role;
grant execute on function public.v2_create_period_charges(int, int, text) to service_role;
grant execute on function public.v2_child_period_price(uuid, int, int) to anon, authenticated, service_role;
grant execute on function public.v2_apply_transfer_repricing(jsonb) to anon, authenticated;

-- Перенос существующих данных ----------------------------------------------------

-- Цена учителя раньше хранилась как «скидка суммой», дававшая итог 4 800.
update public.v2_children
set fixed_price = 4800,
    manual_discount_amount = 0,
    discount_reason = coalesce(nullif(discount_reason, ''), 'Цена учителя (перенесено)'),
    discount_updated_at = now()
where manual_discount_percent = 0
  and manual_discount_amount > 0
  and final_price = 4800;

update public.v2_children
set discount_reason = coalesce(nullif(discount_reason, ''), 'Перенесено из старой системы'),
    discount_updated_at = coalesce(discount_updated_at, now())
where manual_discount_percent > 0 or manual_discount_amount > 0;

select public.v2_refresh_child_prices();

notify pgrst, 'reload schema';
