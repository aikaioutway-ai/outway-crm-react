-- Временное состояние двухфакторного подтверждения водителя:
-- приглашение инициирует логист, а Telegram-аккаунт привязывается только после
-- передачи собственного контакта и совпадения номера с карточкой водителя.

alter table public.v2_driver_telegram_groups
  add column if not exists pending_telegram_user_id bigint,
  add column if not exists pending_started_at timestamptz;

create index if not exists idx_v2_driver_telegram_groups_pending_user
  on public.v2_driver_telegram_groups (pending_telegram_user_id)
  where pending_telegram_user_id is not null;
