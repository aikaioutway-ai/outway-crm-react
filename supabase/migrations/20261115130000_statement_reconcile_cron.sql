-- Фоновая сверка выписок раз в 5 минут: подхватывает новые чеки менеджеров и решения кассира,
-- сделанные в других разделах CRM. Функция statement-api проверяет ключ из vault
-- (v2_statement_reconcile_token), поэтому ключ не хранится ни в коде, ни здесь.
-- Откат: select cron.unschedule('statement-reconcile');
select cron.schedule(
  'statement-reconcile',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://mmcxugtxnfsafgxbpbix.supabase.co/functions/v1/statement-api',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-reconcile-token', public.v2_statement_reconcile_token()),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
