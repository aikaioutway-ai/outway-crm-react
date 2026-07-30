-- Привязка отдельной Telegram-группы к трансферу.

alter table public.v2_transfers
  add column if not exists telegram_chat_id bigint;

create unique index if not exists v2_transfers_telegram_chat_id_key
  on public.v2_transfers (telegram_chat_id)
  where telegram_chat_id is not null;
