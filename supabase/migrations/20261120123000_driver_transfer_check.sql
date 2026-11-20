-- Постоянная ссылка трансфера для водителя и ежедневная сверка детей.
-- Все чтения и записи идут через серверную Edge Function `driver-check-api` (service_role).

alter table public.v2_transfers
  add column if not exists driver_link_token text;

update public.v2_transfers
set driver_link_token = replace(gen_random_uuid()::text, '-', '')
where driver_link_token is null or btrim(driver_link_token) = '';

alter table public.v2_transfers
  alter column driver_link_token set default replace(gen_random_uuid()::text, '-', ''),
  alter column driver_link_token set not null;

create unique index if not exists idx_v2_transfers_driver_link_token
  on public.v2_transfers (driver_link_token);

create table if not exists public.v2_driver_check_marks (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.v2_transfers(id) on delete cascade,
  child_id uuid not null references public.v2_children(id) on delete cascade,
  check_date date not null default ((now() at time zone 'Asia/Bishkek')::date),
  present boolean not null default true,
  marked_at timestamptz not null default now(),
  unique (transfer_id, child_id, check_date)
);

create index if not exists idx_v2_driver_check_marks_date_transfer
  on public.v2_driver_check_marks (check_date, transfer_id);

create index if not exists idx_v2_driver_check_marks_child_id
  on public.v2_driver_check_marks (child_id);

create table if not exists public.v2_driver_check_submissions (
  transfer_id uuid not null references public.v2_transfers(id) on delete cascade,
  check_date date not null default ((now() at time zone 'Asia/Bishkek')::date),
  submitted_at timestamptz not null default now(),
  primary key (transfer_id, check_date)
);

create index if not exists idx_v2_driver_check_submissions_date
  on public.v2_driver_check_submissions (check_date);

alter table public.v2_driver_check_marks enable row level security;
alter table public.v2_driver_check_submissions enable row level security;

revoke all on table public.v2_driver_check_marks from anon, authenticated;
revoke all on table public.v2_driver_check_submissions from anon, authenticated;
