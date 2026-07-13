-- OutWay CRM v2 schema
-- Safe migration: creates new v2_* tables and functions without dropping old tables.
-- Run in Supabase SQL Editor as database owner.

create extension if not exists pgcrypto;

-- Helpers --------------------------------------------------------------------

create or replace function public.v2_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Dictionaries ----------------------------------------------------------------

create table if not exists public.v2_schools (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_school_branches (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.v2_schools(id) on delete cascade,
  code text not null unique,
  short_name text not null,
  name text not null,
  address text,
  latitude double precision,
  longitude double precision,
  manager_phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_tariffs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.v2_schools(id) on delete cascade,
  branch_id uuid references public.v2_school_branches(id) on delete cascade,
  vehicle_type text not null check (vehicle_type in ('microbus', 'minivan', 'sedan')),
  zone text not null check (zone in ('A', 'B', 'C')),
  price numeric(12,2) not null check (price >= 0),
  active_from date not null default current_date,
  active_to date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_tariffs_scope_check check (school_id is not null or branch_id is not null)
);

-- Core CRM --------------------------------------------------------------------

create table if not exists public.v2_families (
  id text primary key,
  parent_name text not null,
  phone text not null,
  phone_telegram boolean not null default false,
  second_phone text,
  second_phone_telegram boolean not null default false,
  contact_name text,
  contact_phone text,
  contact_phone_telegram boolean not null default false,
  comment text,
  status text not null default 'new'
    check (status in ('new', 'active', 'paused', 'inactive', 'rejected', 'archive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_drivers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  second_phone text,
  address text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'vacation', 'dismissed', 'archive')),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_vehicles (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.v2_drivers(id) on delete set null,
  vehicle_type text not null check (vehicle_type in ('microbus', 'minivan', 'sedan')),
  plate_number text,
  brand text,
  model text,
  seats int check (seats is null or seats > 0),
  status text not null default 'active'
    check (status in ('active', 'repair', 'inactive', 'archive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_transfers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.v2_schools(id) on delete set null,
  branch_id uuid references public.v2_school_branches(id) on delete set null,
  driver_id uuid references public.v2_drivers(id) on delete set null,
  vehicle_id uuid references public.v2_vehicles(id) on delete set null,
  transfer_number int not null,
  vehicle_type text not null check (vehicle_type in ('microbus', 'minivan', 'sedan')),
  status text not null default 'active' check (status in ('active', 'inactive', 'archive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, transfer_number)
);

create table if not exists public.v2_children (
  id uuid primary key default gen_random_uuid(),
  family_id text not null references public.v2_families(id) on delete cascade,
  child_name text not null,
  class_name text,
  self_exit_allowed boolean not null default false,
  school_id uuid references public.v2_schools(id) on delete set null,
  branch_id uuid references public.v2_school_branches(id) on delete set null,
  address text,
  latitude double precision,
  longitude double precision,
  distance_km numeric(8,2),
  zone text check (zone in ('A', 'B', 'C')),
  vehicle_type text not null default 'microbus' check (vehicle_type in ('microbus', 'minivan', 'sedan')),
  base_price numeric(12,2) not null default 0 check (base_price >= 0),
  sibling_discount_percent numeric(5,2) not null default 0 check (sibling_discount_percent >= 0),
  manual_discount_percent numeric(5,2) not null default 0 check (manual_discount_percent >= 0),
  manual_discount_amount numeric(12,2) not null default 0 check (manual_discount_amount >= 0),
  final_price numeric(12,2) not null default 0 check (final_price >= 0),
  discount_reason text,
  discount_approved_by text,
  transfer_id uuid references public.v2_transfers(id) on delete set null,
  stop_order int check (stop_order is null or stop_order > 0),
  time_morning time,
  status text not null default 'new'
    check (status in ('new', 'waiting', 'boarded', 'rejected', 'paused')),
  source_family_id text,
  source_sheet text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Wallets and finance ---------------------------------------------------------

create table if not exists public.v2_family_wallets (
  family_id text primary key references public.v2_families(id) on delete cascade,
  main_balance numeric(12,2) not null default 0,
  deposit_balance numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_payments (
  id uuid primary key default gen_random_uuid(),
  family_id text not null references public.v2_families(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  suggested_main_amount numeric(12,2) not null default 0 check (suggested_main_amount >= 0),
  suggested_deposit_amount numeric(12,2) not null default 0 check (suggested_deposit_amount >= 0),
  confirmed_main_amount numeric(12,2) not null default 0 check (confirmed_main_amount >= 0),
  confirmed_deposit_amount numeric(12,2) not null default 0 check (confirmed_deposit_amount >= 0),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'transfer', 'card', 'other')),
  payment_date date not null default current_date,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'cancelled')),
  submitted_by text,
  submitted_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  reject_reason text,
  comment text,
  receipt_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_payments_suggested_sum check (suggested_main_amount + suggested_deposit_amount <= amount),
  constraint v2_payments_confirmed_sum check (confirmed_main_amount + confirmed_deposit_amount <= amount)
);

create table if not exists public.v2_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  family_id text not null references public.v2_families(id) on delete cascade,
  wallet_type text not null check (wallet_type in ('main', 'deposit')),
  transaction_type text not null check (
    transaction_type in (
      'payment_confirmed',
      'charge_writeoff',
      'deposit_writeoff',
      'deposit_topup',
      'adjustment_refund',
      'manual_adjustment',
      'refund'
    )
  ),
  amount numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  source_type text,
  source_id uuid,
  comment text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.v2_charges (
  id uuid primary key default gen_random_uuid(),
  family_id text not null references public.v2_families(id) on delete cascade,
  child_id uuid not null references public.v2_children(id) on delete cascade,
  period_month int not null check (period_month between 1 and 12),
  period_year int not null check (period_year between 2020 and 2100),
  charge_type text not null default 'monthly' check (charge_type in ('monthly', 'deposit', 'may')),
  original_amount numeric(12,2) not null default 0 check (original_amount >= 0),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  debt_amount numeric(12,2) generated always as (greatest(amount - paid_amount, 0)) stored,
  status text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid', 'overpaid', 'cancelled')),
  adjusted_by text,
  adjusted_at timestamptz,
  adjustment_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (child_id, period_month, period_year, charge_type)
);

create table if not exists public.v2_charge_allocations (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references public.v2_charges(id) on delete cascade,
  wallet_transaction_id uuid not null references public.v2_wallet_transactions(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.v2_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id text,
  actor_name text,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  comment text,
  created_at timestamptz not null default now()
);

-- Triggers --------------------------------------------------------------------

drop trigger if exists trg_v2_schools_updated_at on public.v2_schools;
create trigger trg_v2_schools_updated_at before update on public.v2_schools
for each row execute function public.v2_touch_updated_at();

drop trigger if exists trg_v2_school_branches_updated_at on public.v2_school_branches;
create trigger trg_v2_school_branches_updated_at before update on public.v2_school_branches
for each row execute function public.v2_touch_updated_at();

drop trigger if exists trg_v2_tariffs_updated_at on public.v2_tariffs;
create trigger trg_v2_tariffs_updated_at before update on public.v2_tariffs
for each row execute function public.v2_touch_updated_at();

drop trigger if exists trg_v2_families_updated_at on public.v2_families;
create trigger trg_v2_families_updated_at before update on public.v2_families
for each row execute function public.v2_touch_updated_at();

drop trigger if exists trg_v2_children_updated_at on public.v2_children;
create trigger trg_v2_children_updated_at before update on public.v2_children
for each row execute function public.v2_touch_updated_at();

drop trigger if exists trg_v2_payments_updated_at on public.v2_payments;
create trigger trg_v2_payments_updated_at before update on public.v2_payments
for each row execute function public.v2_touch_updated_at();

drop trigger if exists trg_v2_charges_updated_at on public.v2_charges;
create trigger trg_v2_charges_updated_at before update on public.v2_charges
for each row execute function public.v2_touch_updated_at();

-- Indexes ---------------------------------------------------------------------

create index if not exists idx_v2_branches_school on public.v2_school_branches(school_id);
create index if not exists idx_v2_tariffs_branch_lookup on public.v2_tariffs(branch_id, vehicle_type, zone, active);
create index if not exists idx_v2_children_family on public.v2_children(family_id);
create index if not exists idx_v2_children_branch on public.v2_children(branch_id);
create index if not exists idx_v2_children_transfer on public.v2_children(transfer_id, stop_order);
create unique index if not exists uq_v2_children_family_name_class
  on public.v2_children(family_id, child_name, coalesce(class_name, ''));
create index if not exists idx_v2_transfers_branch_number on public.v2_transfers(branch_id, transfer_number);
create index if not exists idx_v2_payments_family_status on public.v2_payments(family_id, status, payment_date desc);
create index if not exists idx_v2_wallet_transactions_family on public.v2_wallet_transactions(family_id, created_at desc);
create index if not exists idx_v2_charges_family_period on public.v2_charges(family_id, period_year, period_month);
create index if not exists idx_v2_charges_child_period on public.v2_charges(child_id, period_year, period_month);
create index if not exists idx_v2_audit_entity on public.v2_audit_log(entity_type, entity_id, created_at desc);

-- Finance functions -----------------------------------------------------------

create or replace function public.v2_ensure_family_wallet(p_family_id text)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.v2_family_wallets(family_id)
  values (p_family_id)
  on conflict (family_id) do nothing;
end;
$$;

create or replace function public.v2_add_wallet_transaction(
  p_family_id text,
  p_wallet_type text,
  p_transaction_type text,
  p_amount numeric,
  p_source_type text default null,
  p_source_id uuid default null,
  p_comment text default null,
  p_created_by text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_balance numeric(12,2);
  v_tx_id uuid;
begin
  perform public.v2_ensure_family_wallet(p_family_id);

  if p_wallet_type = 'main' then
    update public.v2_family_wallets
      set main_balance = main_balance + p_amount,
          updated_at = now()
      where family_id = p_family_id
      returning main_balance into v_balance;
  elsif p_wallet_type = 'deposit' then
    update public.v2_family_wallets
      set deposit_balance = deposit_balance + p_amount,
          updated_at = now()
      where family_id = p_family_id
      returning deposit_balance into v_balance;
  else
    raise exception 'Unknown wallet type: %', p_wallet_type;
  end if;

  insert into public.v2_wallet_transactions(
    family_id, wallet_type, transaction_type, amount, balance_after,
    source_type, source_id, comment, created_by
  )
  values (
    p_family_id, p_wallet_type, p_transaction_type, p_amount, v_balance,
    p_source_type, p_source_id, p_comment, p_created_by
  )
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;

create or replace function public.v2_refresh_charge_status(p_charge_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_amount numeric(12,2);
  v_paid numeric(12,2);
  v_status text;
begin
  select amount, paid_amount into v_amount, v_paid
  from public.v2_charges
  where id = p_charge_id;

  if v_paid <= 0 then
    v_status := 'unpaid';
  elsif v_paid < v_amount then
    v_status := 'partial';
  elsif v_paid = v_amount then
    v_status := 'paid';
  else
    v_status := 'overpaid';
  end if;

  update public.v2_charges
    set status = v_status
    where id = p_charge_id and status <> 'cancelled';
end;
$$;

create or replace function public.v2_apply_wallet_to_charges(
  p_family_id text,
  p_wallet_type text default 'main',
  p_created_by text default null
)
returns numeric
language plpgsql
security definer
as $$
declare
  v_balance numeric(12,2);
  v_available numeric(12,2);
  v_charge record;
  v_pay numeric(12,2);
  v_tx_id uuid;
  v_total numeric(12,2) := 0;
begin
  perform public.v2_ensure_family_wallet(p_family_id);

  select case when p_wallet_type = 'deposit' then deposit_balance else main_balance end
    into v_balance
  from public.v2_family_wallets
  where family_id = p_family_id;

  v_available := greatest(v_balance, 0);
  if v_available <= 0 then
    return 0;
  end if;

  for v_charge in
    select *
    from public.v2_charges
    where family_id = p_family_id
      and status <> 'cancelled'
      and amount > paid_amount
      and (
        (p_wallet_type = 'main' and charge_type = 'monthly' and period_month <> 5)
        or
        (p_wallet_type = 'deposit' and charge_type in ('may', 'deposit'))
      )
    order by period_year, period_month, created_at
  loop
    exit when v_available <= 0;
    v_pay := least(v_available, v_charge.amount - v_charge.paid_amount);

    v_tx_id := public.v2_add_wallet_transaction(
      p_family_id,
      p_wallet_type,
      case when p_wallet_type = 'deposit' then 'deposit_writeoff' else 'charge_writeoff' end,
      -v_pay,
      'charge',
      v_charge.id,
      'Auto writeoff for charge',
      p_created_by
    );

    insert into public.v2_charge_allocations(charge_id, wallet_transaction_id, amount)
    values (v_charge.id, v_tx_id, v_pay);

    update public.v2_charges
      set paid_amount = paid_amount + v_pay
      where id = v_charge.id;

    perform public.v2_refresh_charge_status(v_charge.id);

    v_available := v_available - v_pay;
    v_total := v_total + v_pay;
  end loop;

  return v_total;
end;
$$;

create or replace function public.v2_confirm_payment(
  p_payment_id uuid,
  p_main_amount numeric,
  p_deposit_amount numeric,
  p_reviewed_by text default null
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
      v_payment.family_id, 'deposit', 'deposit_topup', p_deposit_amount,
      'payment', p_payment_id, v_payment.comment, p_reviewed_by
    );
  end if;

  perform public.v2_apply_wallet_to_charges(v_payment.family_id, 'main', p_reviewed_by);
  perform public.v2_apply_wallet_to_charges(v_payment.family_id, 'deposit', p_reviewed_by);

  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, new_value, comment)
  values (
    p_reviewed_by,
    'confirm_payment',
    'payment',
    p_payment_id::text,
    jsonb_build_object('main_amount', p_main_amount, 'deposit_amount', p_deposit_amount),
    'Payment confirmed by cashier'
  );
end;
$$;

create or replace function public.v2_reject_payment(
  p_payment_id uuid,
  p_reject_reason text,
  p_reviewed_by text default null
)
returns void
language plpgsql
security definer
as $$
begin
  update public.v2_payments
    set status = 'rejected',
        reject_reason = p_reject_reason,
        reviewed_by = p_reviewed_by,
        reviewed_at = now()
    where id = p_payment_id and status = 'pending';

  if not found then
    raise exception 'Pending payment not found: %', p_payment_id;
  end if;
end;
$$;

create or replace function public.v2_create_monthly_charges(
  p_period_month int,
  p_period_year int,
  p_created_by text default null
)
returns int
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  if p_period_month not in (1,2,3,4,9,10,11,12) then
    raise exception 'Monthly charges are only for Sep-Apr';
  end if;

  insert into public.v2_charges(
    family_id, child_id, period_month, period_year, charge_type,
    original_amount, amount
  )
  select
    c.family_id, c.id, p_period_month, p_period_year, 'monthly',
    c.final_price, c.final_price
  from public.v2_children c
  where c.status in ('new', 'waiting', 'boarded')
    and c.final_price > 0
  on conflict (child_id, period_month, period_year, charge_type) do nothing;

  get diagnostics v_count = row_count;

  for v_count in select 1 loop
    perform public.v2_apply_wallet_to_charges(family_id, 'main', p_created_by)
    from (
      select distinct family_id
      from public.v2_charges
      where period_month = p_period_month and period_year = p_period_year
    ) f;
  end loop;

  return v_count;
end;
$$;

create or replace function public.v2_create_may_charges(
  p_period_year int,
  p_created_by text default null
)
returns int
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  insert into public.v2_charges(
    family_id, child_id, period_month, period_year, charge_type,
    original_amount, amount
  )
  select
    c.family_id, c.id, 5, p_period_year, 'may',
    c.final_price, c.final_price
  from public.v2_children c
  where c.status in ('new', 'waiting', 'boarded')
    and c.final_price > 0
  on conflict (child_id, period_month, period_year, charge_type) do nothing;

  get diagnostics v_count = row_count;

  perform public.v2_apply_wallet_to_charges(family_id, 'deposit', p_created_by)
  from (
    select distinct family_id
    from public.v2_charges
    where period_month = 5 and period_year = p_period_year
  ) f;

  return v_count;
end;
$$;

create or replace function public.v2_adjust_charge(
  p_charge_id uuid,
  p_new_amount numeric,
  p_reason text,
  p_adjusted_by text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_charge public.v2_charges%rowtype;
  v_refund numeric(12,2);
begin
  if p_new_amount < 0 then
    raise exception 'Amount cannot be negative';
  end if;

  select * into v_charge
  from public.v2_charges
  where id = p_charge_id
  for update;

  if not found then
    raise exception 'Charge not found: %', p_charge_id;
  end if;

  update public.v2_charges
    set amount = p_new_amount,
        adjusted_by = p_adjusted_by,
        adjusted_at = now(),
        adjustment_reason = p_reason
    where id = p_charge_id;

  if v_charge.paid_amount > p_new_amount then
    v_refund := v_charge.paid_amount - p_new_amount;

    update public.v2_charges
      set paid_amount = p_new_amount
      where id = p_charge_id;

    perform public.v2_add_wallet_transaction(
      v_charge.family_id,
      'main',
      'adjustment_refund',
      v_refund,
      'charge',
      p_charge_id,
      p_reason,
      p_adjusted_by
    );
  end if;

  perform public.v2_refresh_charge_status(p_charge_id);

  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, old_value, new_value, comment)
  values (
    p_adjusted_by,
    'adjust_charge',
    'charge',
    p_charge_id::text,
    to_jsonb(v_charge),
    jsonb_build_object('amount', p_new_amount),
    p_reason
  );
end;
$$;

create or replace function public.v2_cancel_payment(
  p_payment_id uuid,
  p_reason text,
  p_cancelled_by text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_payment public.v2_payments%rowtype;
  v_alloc record;
  v_charge public.v2_charges%rowtype;
  v_wallet_type text;
  v_tx_type text;
begin
  select * into v_payment
  from public.v2_charges
  where false; -- dummy, reset

  select * into v_payment
  from public.v2_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found: %', p_payment_id;
  end if;

  if v_payment.status <> 'confirmed' then
    raise exception 'Only confirmed payments can be cancelled, current status: %', v_payment.status;
  end if;

  -- Откатываем каждую аллокацию связанную с транзакциями этого платежа
  for v_alloc in
    select ca.id as alloc_id, ca.charge_id, ca.amount, wt.wallet_type, wt.transaction_type
    from public.v2_charge_allocations ca
    join public.v2_wallet_transactions wt on wt.id = ca.wallet_transaction_id
    where wt.source_type = 'payment' and wt.source_id = p_payment_id
  loop
    -- Откатываем paid_amount на начислении
    update public.v2_charges
      set paid_amount = greatest(paid_amount - v_alloc.amount, 0)
      where id = v_alloc.charge_id;

    perform public.v2_refresh_charge_status(v_alloc.charge_id);

    -- Удаляем аллокацию
    delete from public.v2_charge_allocations where id = v_alloc.alloc_id;
  end loop;

  -- Откатываем пополнение кошелька (main)
  if v_payment.confirmed_main_amount > 0 then
    perform public.v2_add_wallet_transaction(
      v_payment.family_id, 'main', 'payment_cancelled',
      -v_payment.confirmed_main_amount,
      'payment', p_payment_id,
      p_reason, p_cancelled_by
    );
  end if;

  -- Откатываем пополнение депозита
  if v_payment.confirmed_deposit_amount > 0 then
    perform public.v2_add_wallet_transaction(
      v_payment.family_id, 'deposit', 'payment_cancelled',
      -v_payment.confirmed_deposit_amount,
      'payment', p_payment_id,
      p_reason, p_cancelled_by
    );
  end if;

  -- Меняем статус платежа
  update public.v2_payments
    set status = 'cancelled',
        reject_reason = p_reason,
        reviewed_by = p_cancelled_by,
        reviewed_at = now()
    where id = p_payment_id;

  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, old_value, new_value, comment)
  values (
    p_cancelled_by,
    'cancel_payment',
    'payment',
    p_payment_id::text,
    jsonb_build_object('status', 'confirmed', 'amount', v_payment.amount),
    jsonb_build_object('status', 'cancelled'),
    p_reason
  );
end;
$$;

-- Seed branches from current Google Sheets codes --------------------------------

insert into public.v2_schools(code, name)
values
  ('LA', 'Light Academy'),
  ('BKG', 'Билим Бишкек KG'),
  ('AES', 'American-European School'),
  ('KAS', 'Kyrgyz-American School'),
  ('EPS', 'Epsilon'),
  ('GENIUS', 'Genius'),
  ('NOVA', 'Nova International School'),
  ('ING', 'Indigo Schools'),
  ('ERU', 'Эрудит-ISIT'),
  ('TIS', 'Тенсай'),
  ('EDI', 'Edison'),
  ('KRT', 'Креатив-Таалим'),
  ('ABL', 'Академия будущих лидеров'),
  ('KLM', 'Калем Академи Скуул'),
  ('TSL', 'Tesla Academy')
on conflict (code) do update set name = excluded.name, active = true;

with school_map as (
  select id, code from public.v2_schools
)
insert into public.v2_school_branches(school_id, code, short_name, name, address, latitude, longitude, manager_phone)
select s.id, b.code, b.short_name, b.name, b.address, b.lat, b.lng, b.manager_phone
from (
  values
    ('LA', 'LA', 'LA', 'Light Academy', 'ул. Дооронбека Садырбаева, 2/14', 42.863693, 74.558794, '996506242924'),
    ('BKG', 'BKG', 'BKG', 'Билим Бишкек KG', 'ул. Жени-Жока, 7', 42.840230, 74.642759, '996550242924'),
    ('AES', 'AES', 'AES', 'American-European School', 'ул. Дордой, 2/2, Кара-Жыгач', 42.856173, 74.655412, '996506242924'),
    ('KAS', 'KAS', 'KAS', 'Kyrgyz-American School', 'Ин-т Сейсмостойкого Стр-ва 2, 8', 42.808224, 74.630489, '996550242924'),
    ('EPS', 'EPS', 'EPS', 'Epsilon', 'микрорайон Джал-29, 45А', 42.819000, 74.580000, '996550242924'),
    ('GENIUS', 'GEN2', 'GEN #2', 'Гениум Чуйкова', 'ул. Чуйкова, 132А', 42.870000, 74.577000, '996555242924'),
    ('GENIUS', 'GEN4', 'GEN #4', 'Гениум Авангард', 'Гениум Авангард', null, null, '996555242924'),
    ('NOVA', 'NOVA', 'NOVA', 'Nova International School', 'ул. Манаса, 102', 42.857000, 74.692000, '996999260894'),
    ('ING', 'ING', 'ING', 'Индиго Kids', 'ул. Кара-Дарья', 42.809000, 74.643000, '996555242924'),
    ('ING', 'ING_A', 'ING_A', 'Asylkech Girls School', 'Asylkech Girls School', null, null, '996555242924'),
    ('ING', 'ING_P', 'ING_P', 'Indigo Prime Academy', 'Indigo Prime Academy', null, null, '996555242924'),
    ('ING', 'ING_W', 'ING_W', 'Indigo West', 'Indigo West', null, null, '996555242924'),
    ('ERU', 'ERU', 'ERU', 'Эрудит-ISIT', 'ул. Салиева Каралаева, 21/1', 42.841300, 74.585384, '996550242924'),
    ('TIS', 'TIS', 'TIS', 'Тенсай', 'ул. Малдыбаева, 87', 42.815036, 74.648662, '996506242924'),
    ('EDI', 'EDI', 'EDI', 'Edison', 'Edison', null, null, null),
    ('KRT', 'KRT', 'KRT', 'Креатив-Таалим', 'ул. 7 Апреля, 156', 42.858703, 74.634108, '996999260894'),
    ('ABL', 'ABL1', 'ABL #1', 'Академия будущих лидеров (Авангард)', 'ул. Байтик баатыра, 4а/8', 42.84358275219382, 74.63115331300138, '996550242924'),
    ('ABL', 'ABL2', 'ABL #2', 'Академия будущих лидеров (Мавлянова)', 'ул. Жуная Мавлянова, 10', 42.8173419841855, 74.60383769639346, '996550242924'),
    ('KLM', 'KLM', 'KLM', 'Калем Академи Скуул', 'ул. Исы Ахунбаева, 201', 42.84388367480388, 74.57939299999965, '996555242924'),
    ('TSL', 'TSL', 'TSL', 'Tesla Academy', 'ул. 27-я линия, 13а', 42.842265, 74.558067, '996555242924')
) as b(school_code, code, short_name, name, address, lat, lng, manager_phone)
join school_map s on s.code = b.school_code
on conflict (code) do update
set short_name = excluded.short_name,
    name = excluded.name,
    address = excluded.address,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    manager_phone = excluded.manager_phone,
    active = true;

-- Basic RLS -------------------------------------------------------------------
-- Policies are permissive for anon/authenticated users at v2 launch because
-- the current CRM uses a publishable Supabase key without Supabase Auth.
-- Tighten by role after auth roles are finalized.

alter table public.v2_schools enable row level security;
alter table public.v2_school_branches enable row level security;
alter table public.v2_tariffs enable row level security;
alter table public.v2_families enable row level security;
alter table public.v2_children enable row level security;
alter table public.v2_drivers enable row level security;
alter table public.v2_vehicles enable row level security;
alter table public.v2_transfers enable row level security;
alter table public.v2_family_wallets enable row level security;
alter table public.v2_payments enable row level security;
alter table public.v2_wallet_transactions enable row level security;
alter table public.v2_charges enable row level security;
alter table public.v2_charge_allocations enable row level security;
alter table public.v2_audit_log enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'v2_schools','v2_school_branches','v2_tariffs','v2_families','v2_children',
    'v2_drivers','v2_vehicles','v2_transfers','v2_family_wallets','v2_payments',
    'v2_wallet_transactions','v2_charges','v2_charge_allocations','v2_audit_log'
  ]
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'v2 authenticated read'
    ) then
      execute format('create policy "v2 authenticated read" on public.%I for select to authenticated using (true)', t);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'v2 authenticated write'
    ) then
      execute format('create policy "v2 authenticated write" on public.%I for all to authenticated using (true) with check (true)', t);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'v2 anon read'
    ) then
      execute format('create policy "v2 anon read" on public.%I for select to anon using (true)', t);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'v2 anon write'
    ) then
      execute format('create policy "v2 anon write" on public.%I for all to anon using (true) with check (true)', t);
    end if;
  end loop;
end $$;
