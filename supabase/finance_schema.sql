-- OutWay CRM finance schema
-- Run after checking existing data. This creates the normalized finance model:
-- families -> children -> charges, families -> payments -> payment_items.

create table if not exists public.charges (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  period_month int not null check (period_month between 0 and 12),
  year int not null check (year between 2020 and 2100),
  amount numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  debt_amount numeric(12,2) generated always as (greatest(amount + penalty_amount - paid_amount, 0)) stored,
  penalty_amount numeric(12,2) not null default 0,
  status text not null default 'Не оплачено',
  is_frozen boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_charges_child_period unique (child_id, period_month, year)
);

do $$
begin
  if to_regclass('public.payments') is not null
     and not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'payments'
         and column_name = 'payment_type'
     )
     and to_regclass('public.payments_legacy') is null
  then
    alter table public.payments rename to payments_legacy;
  end if;
end $$;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  period_month int check (period_month between 0 and 12),
  year int check (year between 2020 and 2100),
  amount numeric(12,2) not null default 0,
  payment_type text not null default 'cash',
  receipt_url text,
  payment_date date not null default current_date,
  status text not null default 'На проверке',
  created_by text,
  confirmed_by text,
  confirmed_at timestamptz,
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_items (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  period_month int not null check (period_month between 0 and 12),
  year int not null check (year between 2020 and 2100),
  charged_amount numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  debt_amount numeric(12,2) not null default 0,
  status text not null default 'Не оплачено',
  created_at timestamptz not null default now()
);

alter table public.children
  add column if not exists branch_name text,
  add column if not exists address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists distance_km numeric(8,2),
  add column if not exists status text not null default 'active',
  add column if not exists discount_type text not null default 'none',
  add column if not exists discount_value numeric(12,2) not null default 0;

create index if not exists idx_children_family_id on public.children(family_id);
create index if not exists idx_charges_family_period on public.charges(family_id, year, period_month);
create index if not exists idx_charges_child_id on public.charges(child_id);
create index if not exists idx_payments_family_date on public.payments(family_id, payment_date desc);
create index if not exists idx_payment_items_payment_id on public.payment_items(payment_id);
create index if not exists idx_payment_items_family_period on public.payment_items(family_id, year, period_month);

alter table public.charges enable row level security;
alter table public.payments enable row level security;
alter table public.payment_items enable row level security;

-- Development policies. Tighten roles when auth/roles are finalized.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'charges' and policyname = 'allow authenticated read charges') then
    create policy "allow authenticated read charges"
      on public.charges for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'charges' and policyname = 'allow authenticated write charges') then
    create policy "allow authenticated write charges"
      on public.charges for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payments' and policyname = 'allow authenticated read payments') then
    create policy "allow authenticated read payments"
      on public.payments for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payments' and policyname = 'allow authenticated write payments') then
    create policy "allow authenticated write payments"
      on public.payments for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_items' and policyname = 'allow authenticated read payment_items') then
    create policy "allow authenticated read payment_items"
      on public.payment_items for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_items' and policyname = 'allow authenticated write payment_items') then
    create policy "allow authenticated write payment_items"
      on public.payment_items for all to authenticated using (true) with check (true);
  end if;
end $$;
