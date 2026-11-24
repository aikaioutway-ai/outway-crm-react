-- Период фиксируется при привязке группы; повторы не расширяют его назад.
alter table public.v2_whatsapp_history_jobs add column window_end timestamptz not null default now();
create or replace function public.v2_queue_whatsapp_history()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.whatsapp_chat_id is not null and (tg_op = 'INSERT' or new.whatsapp_chat_id is distinct from old.whatsapp_chat_id) then
    insert into public.v2_whatsapp_history_jobs(chat_id) values (new.whatsapp_chat_id)
    on conflict (chat_id) do update set status='queued', window_end=now(), message_ids=null, position=0,
      scanned=0, imported=0, existing=0, other=0, failed=0, attempts=0, discovery_attempts=0,
      limited=false, error=null, lease_id=null, lease_until=null, next_run_at=now(), updated_at=now();
  end if;
  return new;
end $$;
