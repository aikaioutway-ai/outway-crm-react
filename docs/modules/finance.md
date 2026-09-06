<!--
Назначение: раздел "Финансы" (NavSection 'expenses') — самый запутанный по
именованию кластер модулей: src/modules/costs/ExpensesModule.tsx — контейнер
раздела с вкладками; src/modules/expenses/ — табель (Timesheet) и расчёт
зарплаты/подтверждение payroll; src/modules/payroll/ — отдельный обзор
зарплатных выплат по школам. Документ должен явно развести, какой каталог
за какую вкладку отвечает, чтобы не путать expenses vs costs vs payroll.
-->

# Раздел "Финансы"

Проверено по `App.tsx`, `Sidebar.tsx`, `costs/ExpensesModule.tsx`, `payroll/PayrollModule.tsx`, `expenses/TimesheetModule.tsx`, `expenseService.ts`, `crmV2Service.ts`.

## Что видит пользователь

В сайдбаре пункт называется **"Финансы"** (иконка `Receipt`), это `NavSection = 'expenses'`. Доступен ролям `admin`, `gen_director`, `director`, `senior_logist`, `cashier` (см. `getAllowedSections` в `Sidebar.tsx`).

Внутри раздела — три вкладки, переключаемые локальным стейтом `financeTab` в `App.tsx` (`'expenses' | 'timesheet' | 'salary'`):

- **Расходы** (`financeTab = 'expenses'`)
- **Табель** (`financeTab = 'timesheet'`)
- **Зарплата** (`financeTab = 'salary'`)

По умолчанию открывается "Расходы" только для тех, кому разрешено `canAccessFinanceExpenses` (admin/gen_director/cashier) — остальные роли, у кого есть доступ к разделу (`senior_logist`), по умолчанию попадают на "Табель".

## Какой каталог за что отвечает (снимаем путаницу)

Три разных папки участвуют в одном UI-разделе — это исторически сложившееся, не архитектурная ошибка, но источник постоянной путаницы:

| Папка | За что отвечает | Когда используется |
|---|---|---|
| `src/modules/costs/` | Компонент `ExpensesModule.tsx` — сама вкладка "Расходы": форма и таблица операционных расходов компании | `financeTab === 'expenses'` |
| `src/modules/payroll/` | `PayrollModule.tsx` + `PayrollOverview.tsx`/`PayrollSchoolKpiStrip.tsx`/`PayrollTransferDashboard.tsx` — "школа → трансфер"-обвязка (тот же паттерн дашборда, что у Кассира/Логистики/Водителей), выбор школы/периода | И для "Табель", и для "Зарплата" — обе вкладки идут через один и тот же `PayrollModule` |
| `src/modules/expenses/` | `TimesheetModule.tsx` → `TimesheetPage.tsx` — реальная таблица табеля/зарплаты; `SalaryPaymentModal.tsx` — модалка выплаты; `payrollApproval.ts`/`salaryPayment.ts` — расчётная логика | Рендерится **внутри** `PayrollModule`, определяет вид (табель или зарплата) через проп `schoolTab` |

То есть несмотря на название, папка `src/modules/expenses/` — это не "Расходы" (это `costs/`), а табель и зарплата.

## Поток данных по вкладкам

### Вкладка "Расходы"

```
ExpensesModule.tsx (costs/)
  ↓
expenseService.ts
  ↓
Supabase Edge Function "expense-api"   ← не прямой доступ к таблице
  ↓
таблица v2_expenses
```

Особенность: единственная вкладка в разделе, где доступ к данным идёт не напрямую в Supabase-таблицу, а через Edge Function (`supabase.functions.invoke('expense-api', ...)`) с токеном сессии сотрудника в заголовке `x-employee-session`. Реализация проверки — `supabase/functions/expense-api/index.ts`.

### Вкладки "Табель" и "Зарплата"

```
PayrollModule.tsx (payroll/)  — выбор школы/периода, тот же паттерн, что у Cashier/Logistics
  ↓
TimesheetModule.tsx → TimesheetPage.tsx (expenses/)  — сама таблица
  ↓
crmV2Service.ts
  ↓
v2_payroll_entries / v2_payroll_payments / v2_driver_advances
```

Запись выплаты (кнопка в `SalaryPaymentModal.tsx`) идёт через RPC `v2_record_payroll_payments` (см. `supabase/migrations/20260906120000_add_payment_order_number.sql`), не через простой insert — RPC сам проверяет остаток к выплате и не даёт выплатить больше начисленного.

## ASCII-схема

```
Финансы
  ↓
вкладки (financeTab)
  ├─ Расходы            → modules/costs/ExpensesModule.tsx
  │                         → expenseService.ts → Edge Function expense-api
  │                         → v2_expenses
  │
  └─ Табель / Зарплата  → modules/payroll/PayrollModule.tsx (выбор школы/периода)
                            → modules/expenses/TimesheetModule.tsx (сама таблица)
                            → crmV2Service.ts
                            → v2_payroll_entries / v2_payroll_payments / v2_driver_advances
```

## Сущности и таблицы, которые затрагивает раздел

- `v2_expenses` — расходы компании (вкладка "Расходы"); также сюда автоматически попадает запись при подтверждении возврата семье (`v2_confirm_refund` RPC создаёт строку в `v2_expenses` с категорией "Возврат").
- `v2_payroll_entries` — строки табеля (дни, ставка, бонус, пеня) на сотрудника/водителя за период.
- `v2_payroll_payments` — фактические выплаты (табель/зарплата), создаются через RPC `v2_record_payroll_payments`.
- `v2_driver_advances` — авансы водителям, учитываются при расчёте остатка к выплате.

Все шесть таблиц с полем `payment_order_number` (включая `v2_payroll_payments` и `v2_expenses`) описаны в `docs/data-model.md`.

## Важно не путать с

Оплаты **от семей** (депозит, месячные начисления, статусы "На проверке"/"Подтверждено") — это отдельная область, идёт через `financeService.ts` и таблицы `v2_charges`/`v2_payments`/`v2_family_wallets`, не через этот раздел UI. Разбор — в `docs/business-rules.md` и `docs/modules/families-and-cashier.md`.
