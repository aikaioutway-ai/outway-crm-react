-- B2B / нерегулярные перевозки из прежней Lovable CRM.
-- Таблицы изолированы префиксом v2_b2b_, а водители остаются общими
-- для школьного и B2B-модулей через public.v2_drivers.

create table if not exists public.v2_b2b_clients (
  id uuid primary key default gen_random_uuid(),
  client_type text not null default 'individual'
    check (client_type in ('individual', 'company', 'school')),
  company_name text,
  contact_name text not null,
  phone1 text not null,
  phone2 text,
  email text,
  comments text,
  org_name text,
  inn text,
  okpo text,
  legal_address text,
  bank_name text,
  bik text,
  bank_account text,
  signer_position text,
  signer_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_b2b_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  category text not null default 'b2b'
    check (category in ('private', 'b2b', 'school_trip')),
  client_id uuid not null references public.v2_b2b_clients(id) on delete restrict,
  request_date date not null default current_date,
  departure_date date,
  route_from text not null default '',
  route_to text not null default '',
  contact_info text,
  transport_type text not null default 'sedan',
  transport_count integer not null default 1 check (transport_count > 0),
  price_per_unit numeric(14,2) not null default 0 check (price_per_unit >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  status text not null default 'new'
    check (status in ('new', 'in_progress', 'completed', 'cancelled', 'driver_assigned', 'trip_completed', 'ready_to_close', 'success')),
  comments text,
  client_rating integer check (client_rating is null or client_rating between 1 and 5),
  driver_rating integer check (driver_rating is null or driver_rating between 1 and 5),
  legacy_manager_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_b2b_order_driver_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.v2_b2b_orders(id) on delete cascade,
  driver_id uuid not null references public.v2_drivers(id) on delete restrict,
  driver_price numeric(14,2) not null default 0 check (driver_price >= 0),
  driver_total numeric(14,2) not null default 0 check (driver_total >= 0),
  advance_amount numeric(14,2) not null default 0 check (advance_amount >= 0),
  advance_date date,
  advance_payment_method text check (advance_payment_method is null or advance_payment_method in ('cash', 'legal_account', 'personal_account')),
  paid_total numeric(14,2) not null default 0 check (paid_total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_b2b_client_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.v2_b2b_orders(id) on delete cascade,
  payment_type text not null check (payment_type in ('advance', 'final')),
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null default current_date,
  payment_method text not null check (payment_method in ('cash', 'legal_account', 'personal_account')),
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'rejected')),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_b2b_driver_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.v2_b2b_orders(id) on delete cascade,
  assignment_id uuid not null references public.v2_b2b_order_driver_assignments(id) on delete cascade,
  driver_id uuid not null references public.v2_drivers(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'legal_account', 'personal_account')),
  tax_amount numeric(14,2) generated always as
    (case when payment_method = 'legal_account' then round(amount * 0.04, 2) else 0 end) stored,
  net_amount numeric(14,2) generated always as
    (case when payment_method = 'legal_account' then amount - round(amount * 0.04, 2) else amount end) stored,
  purpose text not null default '',
  payment_date date not null default current_date,
  payment_type text not null default 'payment',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_b2b_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null default 'other',
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'legal_account', 'personal_account')),
  tax_amount numeric(14,2) generated always as
    (case when payment_method = 'legal_account' then round(amount * 0.04, 2) else 0 end) stored,
  net_amount numeric(14,2) generated always as
    (case when payment_method = 'legal_account' then amount - round(amount * 0.04, 2) else amount end) stored,
  purpose text not null default '',
  order_id uuid references public.v2_b2b_orders(id) on delete set null,
  comment text,
  legacy_created_by uuid,
  source text not null default 'manual',
  source_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_b2b_documents (
  id uuid primary key default gen_random_uuid(),
  document_number text not null,
  document_type text not null,
  client_id uuid not null references public.v2_b2b_clients(id) on delete restrict,
  status text not null default 'draft',
  total_amount numeric(14,2) not null default 0,
  note text,
  legacy_created_by uuid,
  contract_data jsonb,
  content_html text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_b2b_document_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.v2_b2b_documents(id) on delete cascade,
  description text not null default '',
  quantity numeric(12,2) not null default 1,
  unit_price numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.v2_b2b_document_orders (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.v2_b2b_documents(id) on delete cascade,
  order_id uuid not null references public.v2_b2b_orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (document_id, order_id)
);

create table if not exists public.v2_b2b_order_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.v2_b2b_orders(id) on delete cascade,
  legacy_user_id uuid,
  changed_field text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create index if not exists idx_v2_b2b_orders_request_date on public.v2_b2b_orders(request_date desc);
create index if not exists idx_v2_b2b_orders_departure_date on public.v2_b2b_orders(departure_date desc);
create index if not exists idx_v2_b2b_orders_client on public.v2_b2b_orders(client_id);
create index if not exists idx_v2_b2b_assignments_order on public.v2_b2b_order_driver_assignments(order_id);
create index if not exists idx_v2_b2b_assignments_driver on public.v2_b2b_order_driver_assignments(driver_id);
create index if not exists idx_v2_b2b_client_payments_order on public.v2_b2b_client_payments(order_id, payment_date desc);
create index if not exists idx_v2_b2b_driver_payments_order on public.v2_b2b_driver_payments(order_id, payment_date desc);
create index if not exists idx_v2_b2b_driver_payments_driver on public.v2_b2b_driver_payments(driver_id, payment_date desc);
create index if not exists idx_v2_b2b_expenses_date on public.v2_b2b_expenses(expense_date desc);
create index if not exists idx_v2_b2b_documents_client on public.v2_b2b_documents(client_id);
create index if not exists idx_v2_b2b_order_logs_order on public.v2_b2b_order_logs(order_id, created_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'v2_b2b_clients', 'v2_b2b_orders', 'v2_b2b_order_driver_assignments',
    'v2_b2b_client_payments', 'v2_b2b_driver_payments', 'v2_b2b_expenses',
    'v2_b2b_documents', 'v2_b2b_document_lines', 'v2_b2b_document_orders',
    'v2_b2b_order_logs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = table_name and policyname = 'v2 b2b anon access') then
      execute format('create policy "v2 b2b anon access" on public.%I for all to anon using (true) with check (true)', table_name);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = table_name and policyname = 'v2 b2b authenticated access') then
      execute format('create policy "v2 b2b authenticated access" on public.%I for all to authenticated using (true) with check (true)', table_name);
    end if;
  end loop;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'v2_b2b_clients', 'v2_b2b_orders', 'v2_b2b_order_driver_assignments',
    'v2_b2b_client_payments', 'v2_b2b_driver_payments', 'v2_b2b_expenses',
    'v2_b2b_documents'
  ] loop
    execute format('drop trigger if exists %I_updated_at on public.%I', table_name, table_name);
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.v2_touch_updated_at()', table_name, table_name);
  end loop;
end $$;
