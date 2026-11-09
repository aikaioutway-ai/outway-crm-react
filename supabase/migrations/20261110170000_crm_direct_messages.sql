-- Личные сообщения: канал dm:<id>:<id> (id сотрудников по алфавиту), видят только эти двое.

alter table public.v2_messages drop constraint if exists v2_messages_channel_check;
alter table public.v2_messages add constraint v2_messages_channel_check
  check (channel ~ '^(notifications|all|dept:[a-z_]+|dm:[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+)$');

-- Личные переписки сотрудника (каналы, где есть хотя бы одно сообщение).
create or replace function public.v2_message_dm_channels(p_employee_id text)
returns table(channel text)
language sql
stable
set search_path = ''
as $$
  select distinct m.channel from public.v2_messages m
  where m.channel like 'dm:%'
    and (split_part(m.channel, ':', 2) = p_employee_id or split_part(m.channel, ':', 3) = p_employee_id);
$$;

revoke all on function public.v2_message_dm_channels(text) from public, anon, authenticated;
grant execute on function public.v2_message_dm_channels(text) to service_role;

create index if not exists v2_messages_dm_channel_idx on public.v2_messages (channel) where channel like 'dm:%';
