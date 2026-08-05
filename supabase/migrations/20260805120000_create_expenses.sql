-- Модуль «Расходы». Период определяется только по expense_date — фактической
-- дате совершения платежа, а не по месяцу услуги/назначения расхода.
create table if not exists public.v2_expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  category text not null check (category in ('school', 'office', 'logistics', 'extra_trip', 'personal')),
  subcategory text not null check (length(trim(subcategory)) > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  amount numeric(16, 2) not null check (amount >= 0),
  expense_date date not null,
  payment_method text not null check (payment_method in ('cash', 'cashless')),
  comment text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_expenses_amount_matches check (amount = round(unit_price * quantity, 2))
);

create index if not exists idx_v2_expenses_expense_date on public.v2_expenses(expense_date desc);
create index if not exists idx_v2_expenses_category_date on public.v2_expenses(category, expense_date desc);

create or replace function public.v2_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists v2_expenses_updated_at on public.v2_expenses;
create trigger v2_expenses_updated_at before update on public.v2_expenses
for each row execute function public.v2_touch_updated_at();

alter table public.v2_expenses enable row level security;

-- Намеренно нет политик anon/authenticated: браузер не может читать или менять
-- расходы напрямую. Доступ идёт через expense-api (service role), где проверяется
-- подписанная сессия и роль admin/gen_director.
