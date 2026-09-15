# OUTWAY Telegram Parent Groups Bot

Бот создаёт родительские Telegram-группы по единому шаблону.

## Что делает команда

Команда администратора:

```text
/create TENSAY 1
```

После команды сервис:

1. создаёт новую супергруппу-форум `OUTWAY × TENSAI | Трансфер #1`;
2. добавляет управляющего бота и выдаёт ему необходимые права;
3. скрывает системную тему `General` (если Telegram позволяет это в текущей сессии);
4. создаёт и закрепляет темы:
   - 📢 Информация
   - 📍 Геолокация
   - 🕒 Расписание
   - 💰 Оплаты
   - 💬 Обратная связь
5. публикует стартовый текст в каждой теме и закрепляет его;
6. запрещает обычным участникам отправлять сообщения по умолчанию;
7. создаёт ссылку-приглашение и возвращает её администратору.

## Почему используется не только Bot API

Обычный Telegram Bot API умеет настраивать существующую группу и создавать темы, но не создаёт новую супергруппу от имени компании. Поэтому создание группы выполняется через авторизованную Telegram user-session (MTProto), а дальнейшая настройка — через Bot API.

Для user-session лучше использовать отдельный корпоративный Telegram-аккаунт OUTWAY, а не личный аккаунт сотрудника.

## Переменные окружения

Скопируйте `.env.example` в настройки окружения хостинга и заполните:

- `TELEGRAM_BOT_TOKEN` — токен бота от BotFather;
- `TELEGRAM_BOT_USERNAME` — username бота без `@`;
- `TELEGRAM_ADMIN_IDS` — Telegram user ID администраторов через запятую;
- `TELEGRAM_WEBHOOK_SECRET` — случайная секретная строка для webhook;
- `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` — Telegram API credentials;
- `TELEGRAM_USER_SESSION` — StringSession корпоративного Telegram-аккаунта.

Секреты нельзя коммитить в GitHub.

## Создание TELEGRAM_USER_SESSION

Локально:

```bash
cd telegram-parent-groups-bot
npm install
TELEGRAM_API_ID=... TELEGRAM_API_HASH=... npm run session
```

Скрипт попросит номер телефона, код Telegram и 2FA-пароль при наличии. Полученную строку сохраните как `TELEGRAM_USER_SESSION` только в секретах хостинга.

## Деплой

Можно создать отдельный Vercel Project с Root Directory:

```text
telegram-parent-groups-bot
```

Webhook endpoint после деплоя:

```text
https://<project-domain>/api/webhook
```

После этого webhook нужно зарегистрировать у Telegram Bot API с тем же `TELEGRAM_WEBHOOK_SECRET`.

## Первый тест

1. Написать боту `/start` с Telegram-аккаунта, ID которого указан в `TELEGRAM_ADMIN_IDS`.
2. Выполнить `/create TENSAY 1`.
3. Проверить название, описание, темы, порядок, стартовые сообщения, права родителей и ссылку приглашения.
4. Только после успешного теста создавать остальные группы.
