-- Отключение автозагрузки: select cron.unschedule('whatsapp-history');
-- Новые объекты не изменяют платежи, балансы или уже разобранные чеки.
create table public.v2_whatsapp_history_jobs (
  chat_id text primary key references public.v2_whatsapp_groups(chat_id),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  message_ids text[],
  total integer generated always as (coalesce(cardinality(message_ids),0)) stored,
  position integer not null default 0,
  scanned integer not null default 0,
  imported integer not null default 0,
  existing integer not null default 0,
  other integer not null default 0,
  failed integer not null default 0,
  attempts integer not null default 0,
  discovery_attempts integer not null default 0,
  limited boolean not null default false,
  error text,
  lease_id uuid,
  lease_until timestamptz,
  next_run_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.v2_whatsapp_history_jobs enable row level security;
revoke all on public.v2_whatsapp_history_jobs from public, anon, authenticated;
grant all on public.v2_whatsapp_history_jobs to service_role;
create index v2_whatsapp_history_jobs_pending_idx on public.v2_whatsapp_history_jobs(next_run_at)
  where status in ('queued','running');

create function public.v2_queue_whatsapp_history()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.whatsapp_chat_id is not null and (tg_op = 'INSERT' or new.whatsapp_chat_id is distinct from old.whatsapp_chat_id) then
    insert into public.v2_whatsapp_history_jobs(chat_id) values (new.whatsapp_chat_id)
    on conflict (chat_id) do update set status='queued', message_ids=null, position=0,
      scanned=0, imported=0, existing=0, other=0, failed=0, attempts=0, discovery_attempts=0,
      limited=false, error=null, lease_id=null, lease_until=null, next_run_at=now(), updated_at=now();
  end if;
  return new;
end $$;
revoke all on function public.v2_queue_whatsapp_history() from public, anon, authenticated;
grant execute on function public.v2_queue_whatsapp_history() to service_role;
create trigger v2_transfer_whatsapp_history after insert or update of whatsapp_chat_id on public.v2_transfers
  for each row execute function public.v2_queue_whatsapp_history();

-- Блокировка выдаётся атомарно; зависшая обработка возобновляется через 3 минуты.
create function public.v2_claim_whatsapp_history()
returns setof public.v2_whatsapp_history_jobs language sql security invoker set search_path = '' as $$
  with jobs as (
    select chat_id from public.v2_whatsapp_history_jobs
    where status in ('queued','running') and next_run_at <= now()
      and (lease_until is null or lease_until < now())
    order by next_run_at for update skip locked limit 2
  )
  update public.v2_whatsapp_history_jobs j set status='running', lease_id=gen_random_uuid(),
    lease_until=now()+interval '3 minutes', updated_at=now()
  from jobs where j.chat_id=jobs.chat_id returning j.*;
$$;
revoke all on function public.v2_claim_whatsapp_history() from public, anon, authenticated;
grant execute on function public.v2_claim_whatsapp_history() to service_role;

-- Случайный ключ остаётся в Vault. В HTTP-ответах и исходниках его нет.
do $$ begin
  if not exists (select 1 from vault.secrets where name='whatsapp_history_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'whatsapp_history_token', 'Запуск очереди старых чеков WhatsApp');
  end if;
end $$;
create function public.v2_validate_whatsapp_history_token(p_token text)
returns boolean language sql security definer set search_path = '' as $$
  select coalesce((select auth.jwt()->>'role') = 'service_role' and length(p_token)=64 and exists (
    select 1 from vault.decrypted_secrets where name='whatsapp_history_token' and decrypted_secret=p_token
  ), false);
$$;
revoke all on function public.v2_validate_whatsapp_history_token(text) from public, anon, authenticated;
grant execute on function public.v2_validate_whatsapp_history_token(text) to service_role;

-- Подхватить группы, привязанные до установки этой доработки.
insert into public.v2_whatsapp_history_jobs(chat_id)
select distinct t.whatsapp_chat_id from public.v2_transfers t
join public.v2_whatsapp_groups g on g.chat_id=t.whatsapp_chat_id
where t.whatsapp_chat_id is not null on conflict do nothing;

select cron.schedule('whatsapp-history', '15 seconds', $$
  select net.http_post(
    url := 'https://mmcxugtxnfsafgxbpbix.supabase.co/functions/v1/whatsapp-history-worker',
    headers := jsonb_build_object('Content-Type','application/json','x-history-token',
      (select decrypted_secret from vault.decrypted_secrets where name='whatsapp_history_token' limit 1)),
    body := '{}'::jsonb, timeout_milliseconds := 10000
  ) where exists (select 1 from public.v2_whatsapp_history_jobs where status in ('queued','running') and next_run_at<=now() and (lease_until is null or lease_until<now()));
$$);
