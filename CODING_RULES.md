# OutWay CRM — Инструкция для нового чата
### Обязательно прочитать перед любой работой

---

## ⚡ ГЛАВНЫЙ ПРИНЦИП

**OutWay = Организатор школьного трансфера. НИКОГДА не Перевозчик.**

- ❌ Запрещено: «мы перевозим», «наши водители», «наш транспорт»
- ✅ Правильно: «организуем трансфер», «независимые лицензированные Исполнители»

---

## ⚡ СТИЛЬ РАБОТЫ

- **"фиксируй"** — записать задачу, не выполнять
- **"делай"** — выполнить все накопленные задачи сразу
- Перед изменением файла — всегда загружай актуальную версию из GitHub
- После изменения — проверяй что нет дублей
- Если сломалось — откатись к предыдущему коммиту

---

## 🔑 ДОСТУПЫ

```
GitHub токен:      ghp_XXXX_см_у_Кайрата
GitHub репо NEW:   aikaioutway-ai/outway-crm-react        ← АКТИВНЫЙ (React)
GitHub репо OLD:   aikaioutway-ai/outway-crm              ← старый HTML (не трогать)
Vercel:            задеплоить из outway-crm-react

Supabase project:  mmcxugtxnfsafgxbpbix
Supabase URL:      https://mmcxugtxnfsafgxbpbix.supabase.co
Supabase key:      sb_publishable_0JXvCHTIc984oEoFBloemQ_kCgDF6Bb

Apps Script URL:   https://script.google.com/macros/s/AKfycbz6JUZVRd7qIgGsCCvdReIzcTRKNo65T6l12qA5cSO7K3CRSkUHh0-oia52nj-CT3VP/exec
Google Sheets ID:  1pI1oTTmqgnSEV_Al1dvWs9AXJ7mfDfiu2pRgBTXnmnw
Netlify:           https://clinquant-sprite-ec8c20.netlify.app
```

---

## 🏢 КОМПАНИЯ

- **ООО «АйКай Груп»** / бренд OutWay
- **Директор:** Мамазаирова Айгерим Эсеналиевна
- **Адрес:** г. Бишкек, ул. Аалы Токомбаева, 21/2
- **Деятельность:** Школьный развоз, 13 школ, ~109 ТС, сезон сентябрь–май

## 👥 КОМАНДА

| Имя | Роль |
|-----|------|
| Кайрат | Основатель |
| Нурсултан | Логистика |
| Зуля | Менеджеры, клиенты |
| Маэрим | Финансы, зарплата |
| Бактыгул, Мирлан, Беку | Бригадиры |

---

## 🛠️ ТЕХНОЛОГИИ

```
Frontend:  React + TypeScript
Стили:     CSS переменные (без Tailwind, без styled-components)
Backend:   Supabase (PostgreSQL)
Хостинг:   Vercel (CRM) + Netlify (форма регистрации)
```

---

## 📁 СТРУКТУРА ПРОЕКТА

```
outway-crm-react/src/
├── types/
│   └── index.ts              ← все TypeScript типы
├── utils/
│   ├── pricing.ts            ← getPriceByZone, getFamilyPrice, calcPenalty, money()
│   └── schools.ts            ← SCHOOLS[], schoolByCode()
├── services/
│   └── supabase.ts           ← клиент Supabase
├── core/                     ← ОБЩИЕ компоненты (переиспользуются везде)
│   ├── bars/
│   │   ├── Sidebar.tsx       ← боковое меню
│   │   └── SchoolBar.tsx     ← табы школ сверху
│   ├── cards/
│   │   └── StatusBadge.tsx   ← бейджи статусов
│   ├── tables/               ← DataTable (общая таблица)
│   ├── drawers/              ← боковые панели
│   └── modals/               ← модальные окна
└── modules/                  ← модули по функциям
    ├── families/
    │   └── FamiliesPage.tsx  ← ✅ ГОТОВО — список семей
    ├── finance/              ← 🟡 следующий
    ├── logistics/            ← 🔴 планируется
    ├── drivers/              ← 🔴 планируется
    └── payroll/              ← 🔴 планируется
```

**ПРАВИЛО:** Перед созданием нового компонента — проверь `src/core/`.
Если похожий есть — используй его. Не дублировать.

---

## 🎨 ДИЗАЙН

```css
--bg:        #F0F4FF
--white:     #FFFFFF
--accent:    #312E81
--accent-h:  #27246B
--accent-l:  #C7D2FE
--text:      #1A1A2E
--text-2:    #6B6B8A
--border:    #DDE3F5
--radius:    8px
--font:      Arial, sans-serif
```

- Sidebar — тёмно-индиго `#312E81`
- Hover на строках таблицы — `#EEF2FF`
- Тёмный фон — НИКОГДА
- Все элементы симметричны, тексты жирные (700 для важного, 600 для вторичного)
- Компонент максимум 300–500 строк. Если больше — разбивать.

---

## 🏫 ШКОЛЫ

| Код в БД | Название | access_key (форма) |
|----------|----------|-------------------|
| KINGS    | Kings International School | 1011 |
| LIGHT    | Light Academy | 1010 |
| BILIM    | Bilim KG | 1005 |
| AES      | American-European School | 1004 |
| KAS      | Kyrgyz-American School | 1004 |
| EPSILON  | Epsilon | 1008 |
| GENIUS   | Genius (Чуйкова) | 1009 |
| GENIUS4  | Genius 4 (Авангард) | 1009 |
| NOVA     | Nova International School | 1007 |
| INDIGO   | Indigo | 1006 |
| ERUDIT   | Эрудит-ISIT | 1002 |
| TENSAY   | Тенсай | 1003 |
| EDISON   | Edison | 1001 |

Школы управляются через Google Sheets (лист Schools). Форма загружает динамически через Apps Script `?action=schools`.

---

## 🗃️ БАЗА ДАННЫХ SUPABASE (актуальная схема)

### families — только контакты семьи
```
id (FAM-XXXXXX), parent_name, phone, phone_telegram,
second_phone, second_phone_telegram,
contact_name, contact_phone,
status, comment, created_at,
start_date, payment_method
```

### children — каждый ребёнок полностью независим
```
id, family_id,
child_name, class,
school_code, zone (1/2/3), vehicle_type,
address, latitude, longitude, distance_km,
route_source, transfer_number, stop_number,
time_morning, self_exit_allowed,
status, discount_type, discount_value,
created_at
```

### charges — начисления (создаются автоматически)
```
id, child_id, family_id,
period_month, period_year,
amount, paid_amount, debt_amount,
penalty_amount, status, is_frozen,
created_at, updated_at
```

### payments — факт поступления денег от семьи
```
id, family_id,
period_month, period_year,
amount, payment_type,
receipt_url, payment_date,
status, created_by, confirmed_by,
confirmed_at, comment, created_at
```

### payment_items — разбивка платежа по детям (авто)
```
id, payment_id, child_id, family_id,
period_month, period_year,
charged_amount, paid_amount,
debt_amount, status, created_at
```

### audit_log — история изменений
```
id, family_id, child_id,
user_name, action, field,
old_value, new_value, created_at
```

### schools — в Google Sheets (не в Supabase)
```
code, name, lat, lng, address, manager,
zone1_price, zone2_price, zone3_price,
access_key, active
```

**ВАЖНО:**
- Цена НЕ хранится в БД — считается из school_code + zone + vehicle_type
- zone в БД = число (1/2/3), в коде = буква (A/B/C) — маппинг при загрузке
- families и children джойнятся при отображении в CRM

---

## 💰 ТАРИФЫ 2026–2027

```javascript
const PRICE_RULES = {
  KINGS:   { zone1: 5000, zone2: 5500, zone3: 6000 },
  LIGHT:   { zone1: 5000, zone2: 5500, zone3: 6000 },
  BILIM:   { zone1: 5000, zone2: 5500, zone3: 6500 },
  AES:     { zone1: 5500, zone2: 6000, zone3: 6500 },
  KAS:     { zone1: 5500, zone2: 6000, zone3: 6500 },
  EPSILON: { zone1: 5500, zone2: 6000, zone3: 6500 },
  GENIUS:  { zone1: 5500, zone2: 6000, zone3: 6500 },
  GENIUS4: { zone1: 5500, zone2: 6000, zone3: 6500 },
  NOVA:    { zone1: 5500, zone2: 6000, zone3: 6500 },
  INDIGO:  { zone1: 5500, zone2: 6000, zone3: 6500 },
  ERUDIT:  { zone1: 6000, zone2: 6500, zone3: null },
  TENSAY:  { zone1: 6400, zone2: 6800, zone3: null },
  EDISON:  { zone1: 6500, zone2: 7000, zone3: null },
};
```

**Зоны по дистанции:**
- Зона A (zone=1) → до 3.3 км
- Зона B (zone=2) → 3.3–6.3 км
- Зона C (zone=3) → свыше 6.3 км

**Альтернативный транспорт:**
- Минивэн → 9 500 сом/мес
- Седан → 10 500 сом/мес

**Скидка:** 5% на второго и каждого последующего ребёнка в семье.

---

## 💳 ЛОГИКА ОПЛАТ

### Цепочка статусов
```
Не оплачено
  → менеджер ввёл сумму       → На проверке
  → менеджер прикрепил чек    → На проверке (чек)
  → кассир подтвердил         → Оплачено
  → кассир отклонил           → Не оплачено
Просрочено — авто после 5-го числа
Частично оплачено — кассир подтвердил меньше начисленного
```

### Логика платежа
- Клиент платит одну сумму за семью
- Система распределяет по детям: сначала первый ребёнок, остаток второму и т.д.
- Депозит = цена семьи за 1 месяц

### Пеня
- До 5-го числа → 0
- С 6-го числа → +100 сом/день
- Максимум → 15% от суммы долга
- На депозит → пеня НЕ начисляется
- Статус "На проверке" → пеня ЗАМОРОЖЕНА

### Периоды
```
deposit → Депозит
9  → Сентябрь 2026
10 → Октябрь 2026
11 → Ноябрь 2026
12 → Декабрь 2026
1  → Январь 2027
2  → Февраль 2027
3  → Март 2027
4  → Апрель 2027
5  → Май 2027 (покрывается депозитом)
```

---

## 👤 РОЛИ И ПРАВА

| Роль | Права |
|------|-------|
| admin / Директор | Всё + редактирование начислений |
| manager / Менеджер | Видит всё, вводит оплаты, прикрепляет чеки |
| cashier / Кассир | Подтверждает / отклоняет оплаты |
| logist / Логист | Только логистика, финансы не видит |

---

## 📋 ФОРМА РЕГИСТРАЦИИ (Netlify)

**URL:** https://clinquant-sprite-ec8c20.netlify.app/?s=XXXX

**Как работает:**
1. Форма загружает школы динамически через Apps Script `?action=schools`
2. Родитель заполняет адрес → OSRM считает расстояние → определяется зона
3. Форма отправляет данные в Apps Script `doPost`
4. Apps Script проверяет дубли → пишет в Google Sheets → синхронизирует в Supabase

**Логика дублей (3 шага):**
1. Есть ли ребёнок с таким именем в БД?
2. Совпадает ли телефон?
3. Совпадает ли адрес?
→ Все три совпали = дубль, игнорируем

**Apps Script пишет:**
- `families` — только контакты (НЕ адрес, НЕ школу)
- `children` — school_code, zone, vehicle_type, address, lat, lng, distance_km

---

## 🚀 СТАТУС РАЗРАБОТКИ

### ✅ Сделано
- React + TypeScript проект (`outway-crm-react`)
- Типы, бизнес-логика, Supabase подключение
- Sidebar, SchoolBar, StatusBadge
- FamiliesPage — список семей
- Форма регистрации (Netlify) — динамические школы из Sheets
- Apps Script — дубли + новая схема БД
- БД мигрирована на новую схему (207 семей, 240 детей)

### 🟡 Следующий шаг
- FamiliesPage — обновить запрос: джойнить families + children
- Карточка семьи (Drawer) — показывать детей с их школой/зоной/адресом

### 🔴 Планируется
- Модуль Финансы (charges, payments)
- Модуль Кассир
- Авторизация по ролям
- Модуль Логистика
- Telegram бот

---

## 📋 КАК РАБОТАТЬ В НОВОМ ЧАТЕ

1. Прочитай этот файл полностью
2. Загрузи актуальные файлы из GitHub репо `aikaioutway-ai/outway-crm-react`
3. Проверь структуру — что уже есть в `src/core/` и `src/modules/`
4. Только потом пиши новый код
5. Пуш в `main` ветку — Vercel задеплоит автоматически

### Как пушить через bash
```python
import urllib.request, json, base64

TOKEN = "ghp_XXXX_см_у_Кайрата"
REPO  = "aikaioutway-ai/outway-crm-react"

def push(path, local_file):
    url = f"https://api.github.com/repos/{REPO}/contents/{path}"
    h = {"Authorization": f"token {TOKEN}", "Content-Type": "application/json"}
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h)) as r:
            sha = json.loads(r.read()).get("sha", "")
    except:
        sha = ""
    with open(local_file, "rb") as f:
        c = base64.b64encode(f.read()).decode()
    d = json.dumps({"message": "Update", "content": c, "sha": sha}).encode()
    urllib.request.urlopen(urllib.request.Request(url, data=d, headers=h, method="PUT"))
```

---

*OutWay / АйКай Груп | Бишкек | 2026*
