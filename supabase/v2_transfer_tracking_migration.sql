-- v2_transfer_tracking_migration.sql
-- Живой трекинг трансферов: рейс на день + посадка/высадка по каждому ребёнку.
-- Ничего не удаляет и не переименовывает — безопасно катить на существующую базу.

create extension if not exists pgcrypto;

-- Привязка Telegram-личности водителя (чтобы кнопки в группе жал именно он)
alter table public.v2_drivers
  add column if not exists telegram_user_id bigint unique;

-- Группа трансфера в Telegram (1 трансфер = 1 группа)
alter table public.v2_transfers
  add column if not exists telegram_chat_id bigint unique;

-- Один рейс = один прогон трансфера в одном направлении в конкретный день
create table if not exists public.v2_transfer_runs (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.v2_transfers(id) on delete cascade,
  run_date date not null default current_date,
  direction text not null check (direction in ('morning', 'evening')),
  status text not null default 'not_started'
    check (status in ('not_started', 'active', 'finished', 'cancelled')),

  started_at timestamptz,
  finished_at timestamptz,

  last_latitude double precision,
  last_longitude double precision,
  last_location_at timestamptz,

  next_stop_order int,
  status_message_id bigint,

  school_confirmed_at timestamptz,
  confirmed_by bigint,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transfer_id, run_date, direction)
);

-- Один ребёнок в одном рейсе — его домашняя точка (посадка утром / высадка вечером)
create table if not exists public.v2_transfer_run_stops (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.v2_transfer_runs(id) on delete cascade,
  child_id uuid not null references public.v2_children(id) on delete cascade,
  stop_order int not null,

  status text not null default 'pending'
    check (status in ('pending', 'notified_5min', 'arrived', 'done', 'skipped')),

  notified_5min_at timestamptz,
  arrived_at timestamptz,
  event_at timestamptz,
  confirmed_by bigint,

  created_at timestamptz not null default now(),
  unique (run_id, child_id)
);

create index if not exists idx_v2_transfer_runs_transfer_date
  on public.v2_transfer_runs(transfer_id, run_date, direction);
create index if not exists idx_v2_transfer_runs_active
  on public.v2_transfer_runs(status) where status = 'active';
create index if not exists idx_v2_transfer_run_stops_run
  on public.v2_transfer_run_stops(run_id, stop_order);

drop trigger if exists trg_v2_transfer_runs_updated_at on public.v2_transfer_runs;
create trigger trg_v2_transfer_runs_updated_at
before update on public.v2_transfer_runs
for each row execute function public.v2_touch_updated_at();

alter table public.v2_transfer_runs enable row level security;
alter table public.v2_transfer_run_stops enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['v2_transfer_runs', 'v2_transfer_run_stops']
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
  end loop;
end $$;
