-- OutWay CRM — Таблица сотрудников и доступов
-- Запустить в Supabase SQL Editor

create extension if not exists pgcrypto;

create table if not exists public.v2_employees (
  id text primary key default 'emp-' || gen_random_uuid()::text,
  full_name text not null,
  login text not null unique,
  password_hash text,                          -- SHA-256 hex через pgcrypto
  role text not null check (role in ('admin', 'manager', 'cashier', 'logist', 'driver', 'director')),
  position text not null default '',
  phone1 text not null default '',
  phone2 text,
  address text,
  school_keys text[] not null default '{ALL}', -- школы к которым есть доступ
  status text not null default 'active'
    check (status in ('active', 'inactive', 'dismissed')),
  start_date date,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Функция updated_at (на случай если crm_v2_schema.sql ещё не запускался)
create or replace function public.v2_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- Триггер updated_at
drop trigger if exists v2_employees_updated_at on public.v2_employees;
create trigger v2_employees_updated_at
  before update on public.v2_employees
  for each row execute function public.v2_touch_updated_at();

-- RLS
alter table public.v2_employees enable row level security;

create policy "v2 anon read employees"
  on public.v2_employees for select to anon using (true);

create policy "v2 anon write employees"
  on public.v2_employees for all to anon using (true) with check (true);

-- Дефолтный admin (пароль: admin → хеш SHA-256)
insert into public.v2_employees (id, full_name, login, password_hash, role, position, school_keys, status, comment)
values (
  'emp-admin',
  'Администратор',
  'admin',
  encode(digest('admin', 'sha256'), 'hex'),
  'admin',
  'Управляющий',
  '{ALL}',
  'active',
  'Первичный доступ'
)
on conflict (id) do nothing;
