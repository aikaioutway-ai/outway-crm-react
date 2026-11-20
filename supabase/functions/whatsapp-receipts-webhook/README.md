# Приём чеков из групп WhatsApp (пилот)

Green API передаёт сообщения из выбранных групп. Функция распознаёт файлы и складывает чеки
в `v2_incoming_receipts`, откуда их разбирают в разделе CRM «Чеки». Бот не создаёт платежи
и ничего не пишет в группы. Обычные фото не сохраняются.

## Секреты Supabase

- `GREEN_API_INSTANCE_ID` — номер инстанса Green API.
- `GREEN_API_WEBHOOK_TOKEN` — длинная случайная строка, придуманная для этого вебхука.
- `ANTHROPIC_API_KEY` — ключ для распознавания чеков.
- `GREEN_API_ALLOWED_CHATS` — коды разрешённых групп через запятую (`...@g.us`). Пока список пуст,
  чеки не принимаются, а код группы с присланным файлом появляется в журнале функции.

## Запуск

1. Применить миграцию `20261118120000_incoming_receipts.sql`.
2. Развернуть функцию с отключённой проверкой JWT: доступ проверяется токеном вебхука.
   Вместе с ней развернуть `incoming-receipts-api` для раздела «Чеки».
3. В Green API указать:
   - `webhookUrl` — `https://<project>.supabase.co/functions/v1/whatsapp-receipts-webhook`;
   - `webhookUrlToken` — значение `GREEN_API_WEBHOOK_TOKEN`;
   - `incomingWebhook` = `yes`;
   - `outgoingWebhook`, `outgoingMessageWebhook`, `outgoingAPIMessageWebhook` = `no`;
   - `enableLidMode` оставить `no`, иначе вместо телефонов будут приходить внутренние коды.
4. Добавить номер только в группы пилота. На бесплатном тарифе доступно не больше 3 чатов.
