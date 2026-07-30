-- Привязка Telegram-аккаунта к водителю.
-- Отдельная минимальная миграция для этапа /verify.

alter table public.v2_drivers
  add column if not exists telegram_user_id bigint;

create unique index if not exists v2_drivers_telegram_user_id_key
  on public.v2_drivers (telegram_user_id)
  where telegram_user_id is not null;
