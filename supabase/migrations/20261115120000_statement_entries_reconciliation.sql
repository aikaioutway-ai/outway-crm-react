-- Фоновая сверка выписок. Раньше браузер при каждом открытии скачивал все выписки
-- целиком и сверял сам. Теперь: строки выписки лежат отдельно (повторы отсекаются
-- ключом), сверку считает функция statement-api, результат хранится здесь,
-- экран читает готовое. v2_bank_statements остаётся как исходный файл выписки.
-- Откат: drop table v2_reconciliation_results, v2_reconciliation_runs,
-- v2_bank_statement_entries; drop function v2_statement_reconcile_token();
-- delete from vault.secrets where name = 'statement_reconcile_token'.

create table if not exists public.v2_bank_statement_entries (
  id uuid primary key default gen_random_uuid(),
  -- Одна банковская операция из пересекающихся выписок даёт один ключ (entryKey в statementMatching.ts).
  entry_key text not null unique,
  statement_id uuid not null references public.v2_bank_statements(id) on delete cascade,
  document text not null,
  amount numeric not null,
  posting_date date not null,
  operation_date date,
  op_time text,
  codes text[] not null default '{}',
  source jsonb,
  created_at timestamptz not null default now()
);
create index if not exists v2_bank_statement_entries_statement_idx on public.v2_bank_statement_entries (statement_id);

-- Каждый пересчёт — отдельный прогон; экран читает последний завершённый.
create table if not exists public.v2_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text,
  range_from date,
  range_to date,
  entries_count integer,
  payments_count integer,
  error text
);
create index if not exists v2_reconciliation_runs_finished_idx on public.v2_reconciliation_runs (finished_at desc);

-- Группы: 1 — совпали, 2 — частично, Д — дубли, Х — нет в CRM, missing — нет в выписке.
create table if not exists public.v2_reconciliation_results (
  id bigserial primary key,
  run_id uuid not null references public.v2_reconciliation_runs(id) on delete cascade,
  grp text not null check (grp in ('1', '2', 'Д', 'Х', 'missing')),
  entry_id uuid references public.v2_bank_statement_entries(id) on delete cascade,
  payment_id uuid references public.v2_payments(id) on delete cascade,
  matching_codes text[] not null default '{}',
  payment_status text,
  ord integer not null default 0
);
create index if not exists v2_reconciliation_results_run_idx on public.v2_reconciliation_results (run_id, grp, payment_status);

alter table public.v2_bank_statement_entries enable row level security;
alter table public.v2_reconciliation_runs enable row level security;
alter table public.v2_reconciliation_results enable row level security;
revoke all on public.v2_bank_statement_entries, public.v2_reconciliation_runs, public.v2_reconciliation_results from anon, authenticated;
grant all on public.v2_bank_statement_entries, public.v2_reconciliation_runs, public.v2_reconciliation_results to service_role;
grant usage, select on sequence public.v2_reconciliation_results_id_seq to service_role;

-- Ключ для фонового запуска сверки по расписанию (pg_cron → statement-api).
-- Создаётся случайным внутри базы, в коде и документации не хранится.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'statement_reconcile_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'statement_reconcile_token',
      'Ключ фонового запуска сверки выписок');
  end if;
end $$;

create or replace function public.v2_statement_reconcile_token()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'statement_reconcile_token' limit 1;
$$;
revoke all on function public.v2_statement_reconcile_token() from public, anon, authenticated;
grant execute on function public.v2_statement_reconcile_token() to service_role;
