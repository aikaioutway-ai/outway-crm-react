-- Выписки банка для «Сверки платежей». Раньше хранились только в браузере
-- кассира и пропадали при смене адреса/браузера. Теперь общие для всех,
-- кому открыта сверка. Браузер к таблице доступа не имеет: всё идёт через
-- функцию statement-api с проверкой сессии сотрудника.

create table if not exists public.v2_bank_statements (
  id uuid primary key default gen_random_uuid(),
  file_name text not null check (length(btrim(file_name)) between 1 and 300),
  uploaded_month text check (uploaded_month ~ '^\d{4}-\d{2}$'),
  range_from date not null,
  range_to date not null,
  entries jsonb not null check (jsonb_typeof(entries) = 'array'),
  -- Тот же файл с теми же строками не сохраняется дважды.
  content_hash text not null unique,
  uploaded_by text references public.v2_employees(id) on delete set null,
  uploaded_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists v2_bank_statements_created_idx on public.v2_bank_statements (created_at desc);

alter table public.v2_bank_statements enable row level security;
revoke all on public.v2_bank_statements from anon, authenticated;
grant all on public.v2_bank_statements to service_role;
