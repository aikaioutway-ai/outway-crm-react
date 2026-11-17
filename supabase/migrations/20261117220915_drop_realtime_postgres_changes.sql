-- CRM больше не слушает postgres_changes: изменения детей и трансферов приходят
-- Broadcast-сигналом из триггеров (миграция family_changes_broadcast).
-- Убираем таблицы из публикации — Realtime перестаёт опрашивать WAL раз в секунду.
-- Вернуть: alter publication supabase_realtime add table public.v2_children, public.v2_transfers;
alter publication supabase_realtime drop table public.v2_children, public.v2_transfers;
