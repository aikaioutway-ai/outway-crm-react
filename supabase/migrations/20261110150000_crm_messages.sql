-- Модуль «Сообщения» (решение владельца 2026-11-10).
--
-- Каналы задаются кодом функции message-api (не таблицей):
--   notifications — системные уведомления (только чтение);
--   all — все сотрудники;
--   dept:managers / dept:logistics / dept:cashier / dept:leadership / dept:b2b — отделы.
-- Браузер к таблицам доступа не имеет: всё идёт через message-api с проверкой
-- сессии сотрудника (как задачи).

create table if not exists public.v2_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel ~ '^(notifications|all|dept:[a-z_]+)$'),
  author_id text references public.v2_employees(id) on delete set null,
  author_name text not null,
  body text not null check (length(btrim(body)) between 1 and 4000),
  kind text not null default 'message' check (kind in ('message', 'notification')),
  link jsonb,
  -- Одно и то же уведомление (например, «просрочка за день») не создаётся дважды.
  dedupe_key text unique,
  created_at timestamptz not null default now()
);

create index if not exists v2_messages_channel_created_idx on public.v2_messages (channel, created_at desc);

create table if not exists public.v2_message_reads (
  employee_id text not null references public.v2_employees(id) on delete cascade,
  channel text not null,
  last_read_at timestamptz not null default now(),
  primary key (employee_id, channel)
);

alter table public.v2_messages enable row level security;
alter table public.v2_message_reads enable row level security;
revoke all on public.v2_messages, public.v2_message_reads from anon, authenticated;
grant all on public.v2_messages, public.v2_message_reads to service_role;

-- Сводка по каналам для сотрудника: последнее сообщение и сколько не прочитано.
create or replace function public.v2_message_channel_summary(p_employee_id text, p_channels text[])
returns table(channel text, unread bigint, last_body text, last_author text, last_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select c.channel,
    (select count(*) from public.v2_messages m
      where m.channel = c.channel
        and m.author_id is distinct from p_employee_id
        and m.created_at > coalesce((select r.last_read_at from public.v2_message_reads r where r.employee_id = p_employee_id and r.channel = c.channel), '-infinity'::timestamptz)),
    last.body, last.author_name, last.created_at
  from unnest(p_channels) as c(channel)
  left join lateral (
    select m.body, m.author_name, m.created_at from public.v2_messages m
    where m.channel = c.channel order by m.created_at desc limit 1
  ) last on true;
$$;

revoke all on function public.v2_message_channel_summary(text, text[]) from public, anon, authenticated;
grant execute on function public.v2_message_channel_summary(text, text[]) to service_role;
