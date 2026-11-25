-- Фоновая синхронизация групп WhatsApp: раз в 5 минут функция whatsapp-groups-api сверяет
-- контакты и чаты Green API и подтверждает участие бота. Новая группа, куда добавили бота,
-- появляется в CRM без первого сообщения и без открытия окна выбора группы.
-- Ключ запуска — тот же секрет Vault, что у очереди старых чеков (whatsapp_history_token).
-- Отключение: select cron.unschedule('whatsapp-groups-sync');
select cron.schedule('whatsapp-groups-sync', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://mmcxugtxnfsafgxbpbix.supabase.co/functions/v1/whatsapp-groups-api',
    headers := jsonb_build_object('Content-Type','application/json','x-groups-token',
      (select decrypted_secret from vault.decrypted_secrets where name='whatsapp_history_token' limit 1)),
    body := '{}'::jsonb, timeout_milliseconds := 60000
  );
$$);
