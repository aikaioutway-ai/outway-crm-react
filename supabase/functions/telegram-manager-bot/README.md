# OutWay Telegram Manager Bot

Бот отвечает родителям в зарегистрированных Telegram-группах и в личном чате
по базе знаний OutWay. Вопросы, требующие личных данных, действий в CRM или
отсутствующих знаний, передаются живому менеджеру.

## 1. Подготовить базу

Выполнить `supabase/telegram_manager_bot.sql` в Supabase SQL Editor. Миграция
создаёт:

- реестр подключённых групп;
- базу знаний из FAQ формы и договора 2026–2027;
- журнал вопросов и ответов;
- очередь обращений живому менеджеру.

Тарифы из договора намеренно не копируются. Бот читает активные цены филиала
из `v2_tariffs` при каждом вопросе о стоимости.

## 2. Создать бота через BotFather

1. Открыть `@BotFather` в Telegram.
2. Выполнить `/newbot`, задать имя и username.
3. Сохранить выданный токен.
4. Для безопасного режима `mention` Privacy Mode можно оставить включённым.
5. Для режимов `question` или `all` выполнить `/setprivacy` и выбрать Disable,
   иначе Telegram не будет присылать боту обычные сообщения группы.

## 3. Настроить секреты Supabase

```sh
supabase secrets set TELEGRAM_MANAGER_BOT_TOKEN=<token>
supabase secrets set TELEGRAM_MANAGER_BOT_USERNAME=<username_without_at>
supabase secrets set TELEGRAM_MANAGER_WEBHOOK_SECRET=<long_random_secret>
supabase secrets set TELEGRAM_MANAGER_ADMIN_IDS=<telegram_id_1,telegram_id_2>
supabase secrets set TELEGRAM_MANAGER_CHAT_ID=<internal_manager_group_id>
supabase secrets set ANTHROPIC_API_KEY=<key>
```

`TELEGRAM_MANAGER_CHAT_ID` необязателен, но без него вопросы сохраняются только
в базе и не отправляются в менеджерскую группу. Свой ID и ID чата можно узнать
командой `/id` после запуска бота.

## 4. Развернуть функцию и webhook

```sh
supabase functions deploy telegram-manager-bot --no-verify-jwt
```

Затем зарегистрировать webhook, заменив значения:

```sh
curl -sS -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "content-type: application/json" \
  -d '{"url":"https://<PROJECT_REF>.supabase.co/functions/v1/telegram-manager-bot","secret_token":"<WEBHOOK_SECRET>","allowed_updates":["message"]}'
```

## 5. Подключить родительскую группу

1. Добавить бота в группу с правом отправлять сообщения.
2. Администратор, чей ID указан в `TELEGRAM_MANAGER_ADMIN_IDS`, выполняет
   `/register KRT`, где `KRT` — код филиала в `v2_school_branches`.
3. Родители задают вопрос, отмечая `@username_бота`.

Родитель также может открыть бота напрямую и написать вопрос после `/start`.
Для привязки к семье родитель выполняет `/verify` и нажимает «Поделиться
номером». Бот нормализует номер (например, `0997161771` и `+996 997 161 771`)
и ищет совпадение в `v2_families`. Без явной передачи номера Telegram-аккаунт
по номеру телефона определить нельзя.

Режимы:

- `/mode mention` — отвечает только на упоминания и ответы боту; рекомендуется;
- `/mode question` — отвечает на похожие на вопрос сообщения;
- `/mode all` — обрабатывает все текстовые сообщения; для родительских групп не
  рекомендуется из-за шума и стоимости AI.

## Ограничения безопасности

Бот не публикует в группе баланс, адрес, телефон, чек, данные ребёнка или
индивидуальный маршрут. Он не подтверждает оплату и не изменяет CRM. Такие
запросы фиксируются в `v2_bot_handoffs` и направляются менеджеру.
