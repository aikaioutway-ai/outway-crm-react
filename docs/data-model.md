<!--
Назначение: справочник по таблицам Supabase — families/children/charges/
payments/payment_items/audit_log и параллельный набор v2_* из внешнего
пайплайна регистрации. Фиксирует нетривиальные детали схемы: зона как
число (1/2/3) в БД vs буква (A/B/C) в коде, откуда берётся цена (не
хранится, а вычисляется), связь families/children при джойне.
-->

# Модель данных (Supabase)

Проверено по фактическому коду сервисов (`grep` всех `.from('...')` в `src/services/*.ts`), `project/supabase/crm_v2_schema.sql` и миграциям — не по описанию из CLAUDE.md. Ниже — расхождение с тем, что раньше было написано в CLAUDE.md, отдельно помечено.

## ⚠️ Важное расхождение с CLAUDE.md: живая схема — это `v2_*`, а не `families`/`children`/`charges`/`payments`

Во всех файлах `src/services/*.ts` (полная проверка) используются исключительно таблицы с префиксом `v2_` (`v2_families`, `v2_children`, `v2_charges`, `v2_payments`, `v2_family_wallets`, `v2_wallet_transactions`, `v2_charge_allocations`, `v2_refunds`, `v2_audit_log`, `v2_expenses`, `v2_payroll_entries`, `v2_payroll_payments`, `v2_drivers`, `v2_vehicles`, `v2_transfers`, `v2_schools`, `v2_school_branches`, `v2_b2b_*`, `v2_employees` и т.д.) плюс одна служебная `crm_page_filters`.

Плоские таблицы `families`, `payments`, `payment_items`, `charges` встречаются только в `project/supabase/finance_schema.sql` — это отдельный, не подключённый к коду файл. Ни один сервис их не читает и не пишет. Похоже, это более старая версия схемы, которую вытеснила `v2_*`, но сам файл не удалён.

**Вывод: `v2_*` — не "параллельный набор от внешнего пайплайна", а единственная используемая в приложении схема.** CLAUDE.md сейчас описывает это наоборот — это стоит поправить отдельной задачей (не в рамках этой).

## Основные таблицы (по `crm_v2_schema.sql` + миграции)

- **`v2_families`** — контакты семьи (`parent_name`, `phone`, `status` и т.д.), без адреса и школы.
- **`v2_children`** — один ребёнок = одна строка: школа (`school_id`), филиал (`branch_id`), зона, тип транспорта, адрес/координаты, трансфер (`transfer_id`), **и цена** (см. ниже).
- **`v2_charges`** — начисление за одного ребёнка за один период (`period_month`, `period_year`, `charge_type`). Уникальность: `(child_id, period_month, period_year, charge_type)`.
- **`v2_payments`** — платёж от семьи (не от ребёнка): одна сумма, которая делится на `suggested_main_amount` / `suggested_deposit_amount` (что предложил менеджер) и `confirmed_main_amount` / `confirmed_deposit_amount` (что подтвердил кассир). Статусы: `pending`, `confirmed`, `rejected`, `cancelled`.
- **`v2_family_wallets`** — по одной строке на семью: `main_balance` (обычный баланс) и `deposit_balance` (баланс депозита) — отдельные "кошельки".
- **`v2_wallet_transactions`** — журнал движений по кошелькам (`payment_confirmed`, `charge_writeoff`, `deposit_writeoff`, `deposit_topup`, `refund`, `manual_adjustment` и др.) с `balance_after` на каждую операцию.
- **`v2_charge_allocations`** — связывает начисление (`charge_id`) с конкретной транзакцией кошелька (`wallet_transaction_id`), то есть фиксирует, каким именно списанием было погашено конкретное начисление.
- **`v2_refunds`** — возвраты семьям; при подтверждении кассиром (`v2_confirm_refund` RPC) автоматически создаётся запись в `v2_expenses` (возврат становится расходом компании) и запись в `v2_wallet_transactions`.
- **`v2_audit_log`** — общий журнал действий.

Связь `family → children → charges`: одна семья — много детей, у каждого ребёнка — свои начисления по периодам. Платёж же общий на семью и распределяется по детям не через отдельную таблицу вида `payment_items` (её не существует в `v2_*`), а через пару `v2_wallet_transactions` + `v2_charge_allocations`.

## Что реально хранится, а что вычисляется

`v2_children` хранит цену как колонки: `base_price`, `sibling_discount_percent`, `manual_discount_percent`, `manual_discount_amount`, `final_price`. Это уточнение к формулировке "цена нигде не хранится" — **хранится**, но не вводится вручную произвольным числом: клиент (`FamiliesPage.tsx`, `InlineFamilyCard.tsx`) вычисляет её через `getPriceByZone()` из `utils/pricing.ts` при смене зоны/транспорта/скидки и затем сохраняет результат в эти колонки через `crmV2Service.ts`. То есть источник формулы — `pricing.ts`, но актуальное значение на конкретного ребёнка — это то, что записано в БД на момент последнего пересчёта, а не то, что пересчитывается на каждый рендер.

## Zone: буква и там, и там — не число

`v2_children.zone` — это `text check (zone in ('A','B','C'))`, то есть в БД зона уже хранится буквой, как и в приложении (`Zone = 'A' | 'B' | 'C'` в `src/types/index.ts`). Никакого преобразования число↔буква в текущем коде нет ни в одном сервисе.

Это прямое расхождение с формулировкой в CLAUDE.md ("zone — число в БД, буква в коде"). Похоже, это правило было верно для более старой/другой схемы (в `finance_schema.sql` таблицы `children` вообще нет, так что сверить с ней невозможно) и, вероятно, унаследовано из `CODING_RULES.md`, который сам помечен как местами устаревший. Текущая правда: буква и в БД, и в коде, преобразования нет.

## Депозит = май (подтверждено кодом, с уточнением)

В `financeService.ts` есть буквальный код с комментарием `// депозит хранится как май`:

- Депозит вводится в UI как `periodMonth = 0`, но сохраняется как `period_month = 5`.
- При этом у самого депозита `charge_type = 'deposit'`, а у обычного начисления за май (если оно есть отдельно) — `charge_type = 'may'`. Это два разных типа записи на один и тот же `period_month = 5`.
- И депозит, и начисление за май списываются из кошелька `wallet_type = 'deposit'` (а не `main`) — это и есть механизм "депозит покрывает май".

## Пеня — удалена как бизнес-правило

Пеня по долгу семей больше не является частью OutWay CRM (подтверждённое решение пользователя). Ранее здесь описывалась Edge Function `daily-penalty`, читавшая/писавшая на `v2_charges` колонки `penalty_amount`/`is_frozen`/`penalty_last_charged_on` — **живой проверкой через Supabase REST API подтверждено, что этих трёх колонок на `v2_charges` никогда не существовало** (запросы к ним возвращали `42703 column does not exist`). Функция была нерабочей на момент удаления. Сама функция, связанный клиентский helper (`calcPenalty` в `pricing.ts`) и явный `select` этих полей в `crmV2Service.fetchChargesForPeriod` удалены из кодовой базы. Создавать эти колонки не нужно.

## payment_order_number — подтверждено, реально существует

Добавлено миграцией `20260906120000_add_payment_order_number.sql` на **шесть** таблиц одновременно: `v2_expenses`, `v2_payroll_payments`, `v2_payments`, `v2_b2b_client_payments`, `v2_b2b_driver_payments`, `v2_b2b_expenses`. Это единое сквозное поле для "номера платёжного поручения" везде, где фиксируется факт оплаты — не только у семейных платежей.

## v2_expenses — расходы компании, отдельная таблица

`src/services/expenseService.ts` (через Edge Function `expense-api`) читает/пишет `v2_expenses` — это операционные расходы компании (не путать с `v2_payments`, которые про оплату семьями). Подробный разбор всего финансового кластера ("Расходы"/"Табель"/"Зарплата") — в `docs/modules/finance.md`.

## Где источник истины

Для полей и ограничений, которые здесь не расписаны подробно, — `project/supabase/crm_v2_schema.sql` (основные `create table`) и `project/supabase/migrations/*.sql` (изменения поверх неё). `finance_schema.sql`, `employees_schema.sql` и другие файлы без префикса `v2_` в имени таблиц — читать с осторожностью, они не обязательно отражают то, что реально используется кодом.
