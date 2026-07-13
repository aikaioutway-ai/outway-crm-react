# Поток данных: Netlify → Google Sheet → Apps Script → Supabase → CRM

## Схема

```
Netlify Form  →  Google Apps Script  →  Google Sheet  →  Supabase  →  CRM (React)
(регистрация)     (webhook / doPost)     (хранение)       (БД)         (интерфейс)
```

## 1. Netlify Form

- Пользователь заполняет форму регистрации на сайте (Netlify)
- Форма отправляет POST-запрос на URL Google Apps Script (`doPost`)
- Payload содержит: данные родителя, детей, школы, адреса, цены

## 2. Google Apps Script (`doPost`)

- Принимает payload из Netlify
- Проверяет дубликаты (`isDuplicateV2_`)
- Генерирует уникальный `FamilyID` (формат: `FAM-000001`)
- Записывает данные в Google Sheet (лист по коду школы)
- Синхронизирует данные в Supabase (`syncToSupabaseV2_`)

## 3. Google Sheet

- Хранит все заявки в виде таблицы
- Каждая школа — отдельный лист (LA, BKG, AES и т.д.)
- Spreadsheet ID: `1pI1oTTmqgnSEV_Al1dvWs9AXJ7mfDfiu2pRgBTXnmnw`

## 4. Supabase (БД)

Таблицы:
- `v2_families` — данные родителей
- `v2_children` — данные детей (привязаны к семье)
- `v2_schools` — школы
- `v2_school_branches` — филиалы школ
- `v2_family_wallets` — кошельки семей
- `v2_audit_log` — лог всех действий

## 5. CRM (React)

- Читает данные из Supabase
- Менеджеры обрабатывают заявки, меняют статусы, принимают оплаты

---

## Если заявки не попали в Supabase

Запустить ручную синхронизацию из Google Apps Script:

1. Открыть [script.google.com](https://script.google.com)
2. Выбрать функцию **`uploadAllToSupabaseV2`**
3. Нажать **▶ Run**
4. Проверить логи: View → Logs

Или для одного листа: функция **`uploadSheetToSupabaseV2`** (передать имя листа, например `AES`).

---

## Script Properties (настройки Apps Script)

| Ключ | Описание |
|------|----------|
| `SUPABASE_URL` | URL Supabase проекта |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role ключ Supabase |
| `SPREADSHEET_ID` | ID Google Sheet |
| `FAMILY_COUNTER_KEY` | Счётчик FamilyID (по умолчанию `OUTWAY_FAMILY_COUNTER_V2`) |
