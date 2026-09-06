<!--
Назначение: как устроено приложение целиком — стек (React+TS+Supabase+Vite),
паттерн App.tsx как единственного "роутера" через section-state вместо
react-router, конвенции core/ vs modules/ vs services/ vs hooks/, и карта
ролей → доступные разделы (NavSection). Читать перед любым изменением,
затрагивающим больше одного модуля.
-->

# Архитектура

Проверено по коду на дату написания (App.tsx, Sidebar.tsx, services/*).

## Стек

React 19 + TypeScript, Vite (сборка/dev-сервер), Supabase (Postgres + Edge Functions) как единственный backend, TanStack Query для загрузки/кэша данных, обычный CSS с custom properties (без Tailwind/styled-components/CSS modules).

## Нет роутера — есть один "рубильник" секций

`src/App.tsx` — единственный слой навигации во всём приложении. Никакого react-router или URL-роутинга нет. Вся навигация — это один `useState<NavSection>` (`section`) плюс по отдельному `useState` под локальное UI-состояние каждого раздела (выбранная школа, период, поисковая строка и т.д. — десятки таких стейтов прямо в `App.tsx`).

Каждый крупный раздел — это `React.lazy`-компонент, монтируемый по значению `section`:

```
FamiliesPage   = lazy(() => import('./modules/families/FamiliesPage'))
DriversPage    = lazy(() => import('./modules/drivers/DriversPage'))
EmployeesPage  = lazy(() => import('./modules/employees/EmployeesPage'))
PayrollModule  = lazy(() => import('./modules/payroll/PayrollModule'))
ExpensesModule = lazy(() => import('./modules/costs/ExpensesModule'))
MarketModule   = lazy(() => import('./modules/market/MarketModule'))
B2BModule      = lazy(() => import('./modules/b2b/B2BModule'))
```

Это сделано намеренно: сотрудник не скачивает код всех модулей при каждом входе. При добавлении нового крупного раздела — следовать этому же паттерну (lazy + свой `NavSection`), а не заводить роутер.

## Роли и доступ к разделам

`src/core/bars/Sidebar.tsx` — единственное место, где определён список разделов (`NavSection`) и то, кому какие разделы видны:

- `getAllowedSections(role, userId)` — возвращает список разделов для роли;
- `canAccessSection(role, section, userId)` — булева проверка;
- `canAccessFinanceExpenses(role)` — отдельная более узкая проверка внутри раздела "Финансы" (влияет на то, какая вкладка открывается по умолчанию).

Разделы (`NavSection`): `families`, `employees`, `cashier`, `logistics`, `drivers`, `dispatch`, `expenses` (= "Финансы" в интерфейсе), `market`, `b2b`, `settings`. `dispatch` и `settings` сейчас — заглушки ("в разработке").

Роли (`UserRole` в `src/types/index.ts`): `admin`, `gen_director`, `director`, `manager`, `logist`, `senior_logist`, `cashier`. Раздел `market` — исключение из общей ролевой матрицы: он не завязан на роль, а показывается только одному конкретному сотруднику по `id` (`MARKET_OWNER_EMPLOYEE_ID` в `Sidebar.tsx`).

Любое изменение доступа к разделам — правки в `Sidebar.tsx`, не в отдельных модулях.

## Структура каталогов

- `src/core/` — переиспользуемые UI-примитивы (таблицы, шапка дашборда, селекты, иконки). Проверять здесь перед тем, как писать новый общий компонент.
- `src/modules/<name>/` — один модуль на бизнес-область: `families` (Менеджер+Кассир+Логистика — исторически объединены в одной папке, см. ниже), `drivers`, `costs` + `expenses` + `payroll` (три разных папки под один UI-раздел "Финансы" — см. `docs/modules/finance.md`), `employees`, `b2b`, `market`, `auth`, `parentDemo`. Модуль самодостаточен: страница + под-виды + свой `.css`.
- `src/services/` — весь доступ к Supabase и остальному внешнему миру, один файл на предметную область (`crmV2Service.ts`, `financeService.ts`, `employeeService.ts`, `b2bPaymentService.ts`, `expenseService.ts` и т.д.). Компоненты не должны напрямую вызывать `supabase` — только через сервис.
- `src/hooks/useCrmQueries.ts` — общие TanStack Query хуки поверх сервисов; ключи запросов — в `src/services/queryClient.ts` (`QK`). Переиспользовать существующий хук/ключ, а не плодить параллельный запрос за теми же данными.
- `src/utils/pricing.ts` — вся логика тарифов/зон/скидок/пени (`getPriceByZone`, `getChildPrice`, `getFamilyPrice`, `calcPenalty`, `getZoneByDistance`). Формулы централизованы здесь, но не все из них реально используются в приложении сейчас — детали в `docs/business-rules.md`.
- `src/utils/format.ts` — общие утилиты форматирования (деньги и т.п.).
- `src/types/index.ts` — общие TypeScript-типы (`SchoolCode`, `Zone`, `VehicleType`, `UserRole` и т.д.).

## Сервисный слой — не только прямой доступ к таблицам

Большая часть сервисов обращается к Supabase напрямую через `supabase.from('v2_...')`. Но у "Расходов" (`src/modules/costs/ExpensesModule.tsx` → `expenseService.ts`) другой путь: вызов идёт через Supabase Edge Function `expense-api` (`supabase.functions.invoke('expense-api', ...)`) с передачей токена сессии сотрудника в заголовке `x-employee-session`, а не через прямой CRUD по таблице. Это осознанно другой паттерн доступа — при работе с этой областью ориентироваться на `supabase/functions/expense-api/index.ts`, а не только на клиентский сервис.

## Auth

Supabase Auth не используется. `services/employeeService.ts` аутентифицирует сотрудника по собственным записям приложения, `services/employeeSession.ts` управляет токеном сессии и его временем жизни в `localStorage`. Сам клиент Supabase (`services/supabase.ts`) сконфигурирован с `persistSession: false` — своей сессии Supabase не хранит.

## Стили

Обычный CSS с custom properties, определёнными в `src/index.css` (мятно-бирюзовая палитра: `--bg`, `--accent`, `--surface`, `--text`, `--danger` и т.д.). У каждого модуля — свой соседний `.css`-файл (`B2BModule.css`, `ExpensesModule.css`, `DataTable.css` и т.п.). Подробные UX/UI-правила — в `docs/ux-rules.md`.

## Где смотреть дальше

- Модель данных и реальные таблицы Supabase — `docs/data-model.md`.
- Денежная логика (тарифы, скидки, депозит, пеня) — `docs/business-rules.md`.
- Разбор конкретных модулей — `docs/modules/*.md`.
