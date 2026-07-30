-- Telegram-группы водительских трансферов.
-- Группу создаёт логист, бот автоматически фиксирует её как ожидающую,
-- а привязка к водителю и трансферу выполняется из CRM через edge-функцию.

create extension if not exists pgcrypto;

create table if not exists public.v2_driver_telegram_groups (
  chat_id bigint primary key,
  title text not null,
  status text not null default 'pending'
    check (status in ('pending', 'linked', 'disabled')),
  transfer_id uuid unique references public.v2_transfers(id) on delete set null,
  driver_id uuid references public.v2_drivers(id) on delete set null,
  added_by_telegram_user_id bigint,
  linked_by_employee_id text,
  invite_token_hash text unique,
  invite_expires_at timestamptz,
  driver_confirmed_at timestamptz,
  control_message_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_v2_driver_telegram_groups_status
  on public.v2_driver_telegram_groups (status, created_at desc);

create index if not exists idx_v2_driver_telegram_groups_driver
  on public.v2_driver_telegram_groups (driver_id);

drop trigger if exists trg_v2_driver_telegram_groups_updated_at
  on public.v2_driver_telegram_groups;
create trigger trg_v2_driver_telegram_groups_updated_at
before update on public.v2_driver_telegram_groups
for each row execute function public.v2_touch_updated_at();

alter table public.v2_driver_telegram_groups enable row level security;

-- Таблица содержит Telegram ID и одноразовые токены. Браузер не читает и не
-- меняет её напрямую: доступ идёт через edge-функцию с проверкой сотрудника.
revoke all on public.v2_driver_telegram_groups from anon, authenticated;
