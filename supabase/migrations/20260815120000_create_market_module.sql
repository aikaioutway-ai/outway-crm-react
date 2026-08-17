-- Модуль «Маркет»: доставка продуктов питания школам.
-- Заказ школы → склад (компания-партнёр) комплектует и доставляет →
-- деньги от школы приходят нам → часть перечисляется складу.
-- Доступ к этим таблицам не даётся напрямую anon/authenticated-ключу —
-- ни через RLS-policy, их здесь намеренно нет (см. v2_expenses). Весь
-- доступ идёт через edge-функции market-api (сотрудники CRM) и
-- market-school-login/market-portal-api (портал школ), обе — service role.

create table if not exists public.v2_market_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  category text,
  unit text not null default 'шт',
  purchase_price numeric(12, 2) not null check (purchase_price >= 0),
  sale_price numeric(12, 2) not null check (sale_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_v2_market_products_active on public.v2_market_products(active, name);

create table if not exists public.v2_market_clients (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.v2_schools(id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  contact_person text,
  phone text,
  address text,
  login text not null unique,
  password_hash text,
  active boolean not null default true,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_v2_market_clients_school on public.v2_market_clients(school_id);

create table if not exists public.v2_market_orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity,
  client_id uuid not null references public.v2_market_clients(id) on delete restrict,
  status text not null default 'new' check (status in (
    'new', 'sent_to_warehouse', 'packed', 'delivered', 'paid', 'settled'
  )),
  -- new = Новый, sent_to_warehouse = Отправлен на склад, packed = Собран,
  -- delivered = Доставлен, paid = Оплачен (школой), settled = Выплачен складу
  total_purchase_amount numeric(14, 2) not null default 0,
  total_sale_amount numeric(14, 2) not null default 0,
  delivery_date date,
  created_via text not null default 'crm' check (created_via in ('crm', 'portal')),
  created_by text,
  comment text,
  paid_at timestamptz,
  paid_comment text,
  settled_at timestamptz,
  settled_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_v2_market_orders_status on public.v2_market_orders(status, created_at desc);
create index if not exists idx_v2_market_orders_client on public.v2_market_orders(client_id, created_at desc);

create table if not exists public.v2_market_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.v2_market_orders(id) on delete cascade,
  product_id uuid references public.v2_market_products(id) on delete set null,
  product_name text not null,
  unit text not null,
  quantity numeric(12, 2) not null check (quantity > 0),
  purchase_price numeric(12, 2) not null check (purchase_price >= 0),
  sale_price numeric(12, 2) not null check (sale_price >= 0),
  purchase_amount numeric(14, 2) generated always as (round(quantity * purchase_price, 2)) stored,
  sale_amount numeric(14, 2) generated always as (round(quantity * sale_price, 2)) stored,
  created_at timestamptz not null default now()
);

create index if not exists idx_v2_market_order_items_order on public.v2_market_order_items(order_id);

-- updated_at на products/clients/orders — переиспользуем существующую функцию.
drop trigger if exists v2_market_products_updated_at on public.v2_market_products;
create trigger v2_market_products_updated_at before update on public.v2_market_products
for each row execute function public.v2_touch_updated_at();

drop trigger if exists v2_market_clients_updated_at on public.v2_market_clients;
create trigger v2_market_clients_updated_at before update on public.v2_market_clients
for each row execute function public.v2_touch_updated_at();

drop trigger if exists v2_market_orders_updated_at on public.v2_market_orders;
create trigger v2_market_orders_updated_at before update on public.v2_market_orders
for each row execute function public.v2_touch_updated_at();

-- Суммы заказа всегда пересчитываются из позиций — независимо от того,
-- кто их менял (CRM или edge-функция портала школ).
create or replace function public.v2_market_recalc_order_totals()
returns trigger language plpgsql as $$
declare
  target_order_id uuid;
begin
  target_order_id := coalesce(new.order_id, old.order_id);
  update public.v2_market_orders o
  set
    total_purchase_amount = coalesce((
      select sum(purchase_amount) from public.v2_market_order_items where order_id = target_order_id
    ), 0),
    total_sale_amount = coalesce((
      select sum(sale_amount) from public.v2_market_order_items where order_id = target_order_id
    ), 0)
  where o.id = target_order_id;
  return null;
end;
$$;

drop trigger if exists v2_market_order_items_recalc on public.v2_market_order_items;
create trigger v2_market_order_items_recalc
after insert or update or delete on public.v2_market_order_items
for each row execute function public.v2_market_recalc_order_totals();

alter table public.v2_market_products enable row level security;
alter table public.v2_market_clients enable row level security;
alter table public.v2_market_orders enable row level security;
alter table public.v2_market_order_items enable row level security;

-- Намеренно нет политик anon/authenticated: цены закупки, маржа и данные
-- клиентов не должны быть доступны напрямую ни из CRM-бандла, ни тем более
-- из бандла портала школ (там anon-ключ публичен по определению). Доступ —
-- только через edge-функции под service role.
