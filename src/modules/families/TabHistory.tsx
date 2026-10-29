import FilterableTable from '../../core/tables/FilterableTable';
import React, { useState } from 'react';

interface AuditEntry {
  id: string; userName: string; action: string;
  field: string; oldValue: string; newValue: string; createdAt: string;
  /** Ребёнок (и период начисления), к которому относится запись. */
  subject?: string; comment?: string;
}

const ACTION_LABEL: Record<string, string> = {
  'Платёж': 'Внёс платёж на проверку',
  'Подтверждение': 'Подтвердил платёж',
  'Отмена подтверждения': 'Отменил подтверждение платежа',
  'Возврат': 'Оформил возврат',
  'Подтверждение возврата': 'Подтвердил возврат',
  'Отклонение возврата': 'Отклонил возврат',
  'Редактирование': 'Изменил данные клиента',
  'Редактирование ребёнка': 'Изменил данные ребёнка',
  'Начисления': 'Создал начисления',
  // Заявки
  create_application:     'Новая заявка',
  create_family:          'Создана семья',
  update_family:          'Изменена семья',
  delete_family:          'Удалена семья',
  // Дети
  create_child:           'Добавлен ребёнок',
  add_child:              'Добавлен ребёнок',
  update_child:           'Изменён ребёнок',
  delete_child:           'Удалён ребёнок',
  remove_child:           'Удалён ребёнок',
  child_status_change:    'Смена статуса ребёнка',
  transfer_x:             'Отправлен в трансфер Х',
  field_change:           'Изменены данные',
  family_delete:          'Удалена семья',
  child_delete:           'Удалён ребёнок',
  // Начисления и скидки (записи из базы)
  manual_charge:          'Поставлено начисление',
  adjust_charge:          'Изменено начисление',
  charge_on_boarding:     'Начисление при посадке',
  set_discount_choice:    'Изменена скидка',
  set_discount:           'Изменена скидка',
  set_fixed_price:        'Фиксированная цена',
  transfer_reprice:       'Пересадка / цена трансфера',
  payment_reallocation:   'Перенос оплаты',
  'Изменение даты посадки': 'Изменена дата посадки',
  // Финансы
  payment_submit:         'Внесён платёж',
  payment_confirm:        'Платёж подтверждён',
  payment_reject:         'Платёж отклонён',
  payment_delete:         'Платёж удалён',
  charge_edit:            'Изменено начисление',
  charge_create:          'Создано начисление',
  charge_delete:          'Удалено начисление',
  // Статусы
  status_change:          'Смена статуса',
  update_status:          'Смена статуса',
  // Транспорт / зона
  vehicle_change:         'Смена транспорта',
  zone_change:            'Смена зоны',
  update_vehicle:         'Смена транспорта',
  update_zone:            'Смена зоны',
  // Общее
  create:                 'Создание',
  update:                 'Изменение',
  delete:                 'Удаление',
  insert:                 'Создание',
};

const FIELD_LABEL: Record<string, string> = {
  // Поля ребёнка и семьи из автоматической записи базы
  class_name: 'Класс', self_exit_allowed: 'Сам выходит', branch_id: 'Филиал',
  distance_km: 'Расстояние, км', requested_vehicle_type: 'Тип ТС (заявка)',
  base_price: 'Тариф', final_price: 'Стоимость', fixed_price: 'Фикс. цена',
  discount_override_percent: 'Скидка, %', manual_discount_percent: 'Скидка, %', manual_discount_amount: 'Скидка, сом',
  discount_valid_from: 'Скидка с', discount_valid_to: 'Скидка до', discount_reason: 'Причина скидки',
  transfer_id: 'Трансфер', stop_order: 'Остановка', transfer_assigned_at: 'Дата посадки',
  second_phone_telegram: 'Telegram (доп.)', contact_name: 'Доп. контакт',
  contact_phone: 'Телефон доп. контакта', contact_phone_telegram: 'Telegram (доп. контакт)',
  contactName: 'Доп. контакт', contactPhone: 'Телефон доп. контакта',
  family_payment: 'Платёж', family_refund: 'Возврат',
  child_route: 'Маршрут ребёнка', charge_discount: 'Скидка на начисление',
  fullAddress: 'Адрес', parentName: 'Имя родителя', secondPhone: 'Доп. телефон',
  childName: 'Имя ребёнка', schoolCode: 'Школа', vehicleType: 'Тип транспорта',
  finalPrice: 'Стоимость', basePrice: 'Тариф', transferNumber: 'Трансфер',
  stopNumber: 'Остановка', timeMorning: 'Время утром', selfExitAllowed: 'Самостоятельный выход',
  status:           'Статус',
  vehicle_type:     'Тип транспорта',
  zone:             'Зона',
  amount:           'Сумма',
  payment_method:   'Способ оплаты',
  payment_order_number: '№ платёжного поручения',
  phone:            'Телефон',
  phone_telegram:   'Телефон (Telegram)',
  second_phone:     'Доп. телефон',
  address:          'Адрес',
  parent_name:      'Имя родителя',
  comment:          'Комментарий',
  school_code:      'Школа',
  child_name:       'Имя ребёнка',
  class:            'Класс',
  start_date:       'Дата начала',
  transfer_number:  'Номер трансфера',
  stop_number:      'Номер остановки',
  time_morning:     'Время (утро)',
  discount_type:    'Тип скидки',
  discount_value:   'Размер скидки',
  family:           'Семья',
  child:            'Ребёнок',
  payment:          'Платёж',
  charge:           'Начисление',
};

const VALUE_LABEL: Record<string, string> = {
  cash: 'Наличные', transfer: 'АйКай Мбанк', card: 'АйКай Мбанк',
  pending: 'На проверке', confirmed: 'Подтверждено',
  // Статусы семьи
  new:        'Новый',
  active:     'Активный',
  paused:     'Пауза',
  inactive:   'Неактивный',
  rejected:   'Отказ',
  archive:    'Архив',
  // Статусы ребёнка
  boarded:    'Посажен',
  waiting:    'Ожидает',
  // Оплата
  paid:       'Оплачено',
  unpaid:     'Не оплачено',
  partial:    'Частично',
  overdue:    'Просрочено',
  cancelled:  'Отменено',
  // Транспорт
  microbus:   'Микроавтобус',
  minivan:    'Минивэн',
  sedan:      'Седан',
  // Зоны
  A: 'Зона A',
  B: 'Зона B',
  C: 'Зона C',
  // Булевы
  true:  'Да',
  false: 'Нет',
};

function parseValue(raw: string): unknown {
  let value: unknown = raw;
  for (let depth = 0; depth < 3 && typeof value === 'string'; depth += 1) {
    try { value = JSON.parse(value); } catch { break; }
  }
  return value;
}

function humanizeValue(raw: unknown): string {
  if (raw == null || raw === '' || raw === '-') return '—';
  if (typeof raw === 'object') return '';
  const value = VALUE_LABEL[String(raw)] ?? String(raw);
  if (value.length > 90 || /^[[{]/.test(value)) return '';
  return value;
}

function conciseAction(entry: AuditEntry): string | null {
  const before = parseValue(entry.oldValue);
  const after = parseValue(entry.newValue);
  const next = after && typeof after === 'object' ? after as Record<string, unknown> : null;
  const payment = /payment|плат[её]ж|чек/i.test(`${entry.field} ${entry.action}`);
  const status = String(next?.status ?? after ?? '');
  if (payment && /^(Отклонено|rejected)$/i.test(status)) return 'Чек отклонён';
  if (payment && /^(Подтверждено|confirmed)$/i.test(status)) return 'Чек подтверждён';
  const previous = before && typeof before === 'object' ? before as Record<string, unknown> : null;
  const commentChanged = previous && next && previous.comment !== next.comment;
  if (commentChanged && /\[Логистика\]|Трансфер №/.test(`${previous.comment ?? ''} ${next.comment ?? ''}`)) return 'Изменён трансфер';
  if (/transfer|route/.test(entry.field) || /трансфер|маршрут/i.test(entry.action)) return 'Изменён трансфер';
  return null;
}

function routeChangeDetails(entry: AuditEntry): string {
  const before = parseValue(entry.oldValue);
  const after = parseValue(entry.newValue);
  const old = before && typeof before === 'object' ? before as Record<string, unknown> : {};
  const next = after && typeof after === 'object' ? after as Record<string, unknown> : {};
  const changes: string[] = [];
  for (const [label, keys] of [
    ['Трансфер', ['transferNumber', 'transfer_number']],
    ['Тип ТС', ['vehicleType', 'vehicle_type']],
  ] as const) {
    const keyList: readonly string[] = keys;
    const oldKey = keyList.find(key => key in old);
    const nextKey = keyList.find(key => key in next);
    if (!nextKey) continue;
    const previous = oldKey ? old[oldKey] : undefined;
    const current = next[nextKey];
    if (previous === current) continue;
    const display = (value: unknown) => label === 'Трансфер' && value ? `№ ${value}` : humanizeValue(value);
    changes.push(`${label}: ${display(previous)} → ${display(current)}`);
  }
  if (changes.length) return changes.join('; ');
  if (/^(vehicle_type|vehicleType|transfer_number|transferNumber)$/.test(entry.field)) {
    return `${/vehicle/.test(entry.field) ? 'Тип ТС' : 'Трансфер'}: ${humanizeValue(before)} → ${humanizeValue(after)}`;
  }
  // Older logistics records stored the transition inside the comment.
  // Extract only explicit vehicle transitions, never the full comment.
  const comment = `${old.comment ?? ''} ${next.comment ?? ''}`;
  const pattern = /изначально выбран\s+(microbus|minivan|sedan),?\s+фактически определ[её]н\s+(microbus|minivan|sedan)/gi;
  const transitions = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(comment))) {
    const from = match[1].toLowerCase();
    const to = match[2].toLowerCase();
    if (from !== to) transitions.add(`Тип ТС: ${humanizeValue(from)} → ${humanizeValue(to)}`);
  }
  return Array.from(transitions).slice(0, 2).join('; ') || 'Прежние и новые значения не сохранены';
}

const MONEY_FIELDS = new Set(['base_price', 'final_price', 'fixed_price', 'manual_discount_amount', 'finalPrice', 'basePrice', 'amount', 'price']);
const TRANSFER_FIELDS = new Set(['transfer_id', 'transfer_number', 'transferNumber']);
const MONTH_NAMES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

/** Значение поля так, как его привыкли видеть в CRM: суммы, «№ 4», даты, проценты. */
function formatFieldValue(key: string, raw: unknown): string {
  if (raw == null || raw === '' || raw === '-') return '—';
  if (typeof raw === 'object') return '';
  if (typeof raw === 'boolean') return raw ? 'Да' : 'Нет';
  const text = String(raw);
  if (TRANSFER_FIELDS.has(key)) return `№ ${text}`;
  if (MONEY_FIELDS.has(key) && Number.isFinite(Number(text))) return Number(text).toLocaleString('ru-RU');
  if (/percent/.test(key) && Number.isFinite(Number(text))) return `${Number(text)}%`;
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (date) return `${date[3]}.${date[2]}.${date[1]}`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(text)) return text.slice(0, 5);
  if (VALUE_LABEL[text]) return VALUE_LABEL[text];
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

function asObject(raw: string): Record<string, unknown> {
  const value = parseValue(raw);
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function periodName(month: unknown, type?: unknown): string {
  if (type === 'deposit' || Number(month) === 0) return 'Депозит';
  return MONTH_NAMES[Number(month) - 1] ? MONTH_NAMES[Number(month) - 1][0].toUpperCase() + MONTH_NAMES[Number(month) - 1].slice(1) : 'Месяц';
}

/** Записи начислений, скидок и пересадок, которые база пишет своим форматом. */
function specialDetails(entry: AuditEntry): string | null {
  const before = asObject(entry.oldValue);
  const after = asObject(entry.newValue);
  switch (entry.action) {
    case 'manual_charge':
      return `${periodName(after.month, after.type)}: ${formatFieldValue('amount', after.amount)}`;
    case 'adjust_charge':
      return [`Сумма: ${formatFieldValue('amount', before.amount)} → ${formatFieldValue('amount', after.amount)}`, entry.comment].filter(Boolean).join(' · ');
    case 'charge_on_boarding':
      return `${periodName(after.month)}: ${formatFieldValue('price', after.price)}`;
    case 'set_discount_choice':
      return `Скидка: ${formatFieldValue('percent', before.percent ?? 0)} → ${after.percent == null ? 'автоматически' : formatFieldValue('percent', after.percent)}`;
    case 'set_discount':
      return `Скидка: ${formatFieldValue('percent', before.percent ?? 0)} → ${formatFieldValue('percent', after.percent ?? 0)}${Number(after.amount) ? `, ${formatFieldValue('amount', after.amount)} сом` : ''}`;
    case 'set_fixed_price':
      return `Фикс. цена: ${formatFieldValue('fixed_price', before.fixed_price)} → ${formatFieldValue('fixed_price', after.fixed_price)}`;
    case 'transfer_reprice': {
      const match = /#(\d+):\s*(\w+)\s*->\s*(\w+)/.exec(entry.comment ?? '');
      if (!match) return entry.comment ?? '';
      const vehicle = match[2] !== match[3] ? `; Тип ТС: ${formatFieldValue('vehicle_type', match[2])} → ${formatFieldValue('vehicle_type', match[3])}` : '';
      return `Трансфер № ${match[1]}${vehicle}`;
    }
    case 'payment_reallocation':
    case 'family_delete':
      return entry.comment ?? '';
    default:
      return null;
  }
}

function transferXDetails(entry: AuditEntry): string {
  const before = parseValue(entry.oldValue);
  const old = before && typeof before === 'object' ? before as Record<string, unknown> : {};
  const parts = [old.child_name && !entry.subject ? String(old.child_name) : '', old.transfer_number ? `был № ${old.transfer_number}` : ''];
  return parts.filter(Boolean).join(' · ');
}

function describeChange(entry: AuditEntry): string {
  if (entry.action === 'transfer_x') return transferXDetails(entry);
  const special = specialDetails(entry);
  if (special !== null) return special;
  if (entry.action === 'create_child') return '';
  const concise = conciseAction(entry);
  if (concise === 'Изменён трансфер') return routeChangeDetails(entry);
  if (concise) return '';
  const oldValue = parseValue(entry.oldValue);
  const newValue = parseValue(entry.newValue);
  if (oldValue && newValue && typeof oldValue === 'object' && typeof newValue === 'object') {
    const before = oldValue as Record<string, unknown>;
    const after = newValue as Record<string, unknown>;
    // Все изменённые поля «было → стало»; комментарий — только из автоматической записи базы.
    return Object.keys(after)
      .filter(key => FIELD_LABEL[key] && (key !== 'comment' || entry.action === 'field_change') && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      .map(key => `${FIELD_LABEL[key]}: ${formatFieldValue(key, before[key])} → ${formatFieldValue(key, after[key])}`)
      .join('; ');
  }
  const oldText = humanizeValue(oldValue);
  const newText = humanizeValue(newValue);
  if (!oldText && !newText) return '';
  return oldText === '—' ? (newText === '—' ? '' : newText) : `${oldText} → ${newText}`;
}

function actionLabel(entry: AuditEntry): string {
  if (entry.action === 'transfer_x') return ACTION_LABEL.transfer_x;
  if (entry.action === 'field_change') return entry.field === 'family' ? 'Изменены данные семьи' : 'Изменены данные ребёнка';
  if (ACTION_LABEL[entry.action] && specialDetails(entry) !== null) return ACTION_LABEL[entry.action];
  const concise = conciseAction(entry);
  if (concise) return concise;
  if (ACTION_LABEL[entry.action]) return ACTION_LABEL[entry.action];
  if (!/[a-z_]/i.test(entry.action)) return entry.action.length > 70 ? 'Изменены данные клиента' : entry.action;
  const subject = FIELD_LABEL[entry.field] ?? 'Данные клиента';
  if (/delete|remove|cancel/.test(entry.action)) return `${subject}: удаление или отмена`;
  if (/confirm|approve/.test(entry.action)) return `${subject}: подтверждение`;
  if (/create|insert|add|submit/.test(entry.action)) return `${subject}: добавление`;
  return `${subject}: изменение`;
}

/** Ребёнок записи: из базы, а у старых правок карточки — из сохранённых данных ребёнка. */
function subjectOf(entry: AuditEntry): string {
  if (entry.subject) return entry.subject;
  if (entry.action !== 'Редактирование ребёнка') return '';
  const name = asObject(entry.newValue).childName ?? asObject(entry.oldValue).childName;
  return typeof name === 'string' ? name : '';
}

// Служебные записи без смысла для сотрудника.
const HIDDEN_ACTIONS = new Set(['Сохранение карточки', 'family_comment_simplified', 'confirm_payment', 'unconfirm_payment']);

function formatAuditDate(raw: string): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function TabHistory({ audit }: { audit: AuditEntry[] }) {
  const [deletedOnly, setDeletedOnly] = useState(false);
  const visibleAudit = (deletedOnly ? audit.filter(entry => entry.action === 'payment_delete') : audit.filter(entry => !HIDDEN_ACTIONS.has(entry.action)))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (audit.length === 0) return <p style={{ color: '#718096', padding: 20 }}>История изменений пуста</p>;

  return (
    <div>
      <button type="button" onClick={() => setDeletedOnly(value => !value)} aria-pressed={deletedOnly}
        style={{ marginBottom: 12, border: '1px solid #dce4eb', borderRadius: 7, padding: '7px 11px', background: '#fff', color: '#475467', cursor: 'pointer', fontSize: 12 }}>
        {deletedOnly ? 'Вся история' : 'Удалённые чеки'}
      </button>
      <div style={{ overflowX: 'auto', border: '1px solid #e5eaf0', borderRadius: 10 }}>
        <FilterableTable className="family-history-table">
          <thead><tr><th scope="col">Дата</th><th scope="col">Кто</th><th scope="col">Что сделал</th></tr></thead>
          <tbody>
            {visibleAudit.length === 0 && <tr><td colSpan={3}>Удалённых чеков нет</td></tr>}
            {visibleAudit.map(entry => {
              let deletedPayment: Record<string, unknown> | null = null;
              if (entry.action === 'payment_delete') {
                try { deletedPayment = JSON.parse(entry.oldValue)?.payment ?? null; } catch { /* Older record. */ }
              }
              const description = describeChange(entry);
              return (
                <tr key={entry.id}>
                  <td>{formatAuditDate(entry.createdAt)}</td>
                  <td>{!entry.userName || /^FAM-|^SYS-|^[0-9a-f]{8}-/i.test(entry.userName) ? 'Система' : entry.userName}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{actionLabel(entry)}</div>
                    {subjectOf(entry) && <div className="family-history-details">Ребёнок: {subjectOf(entry)}</div>}
                    {!deletedPayment && description && <div className="family-history-details">{description}</div>}
                    {deletedPayment && <details className="family-history-details">
                      <summary>Данные удалённого платежа · {String(deletedPayment.amount ?? '')}</summary>
                      <p>Дата: {String(deletedPayment.payment_date ?? '—')} · № {String(deletedPayment.payment_number ?? '—')}</p>
                      <p>Комментарий: {String(deletedPayment.comment ?? '—')}</p>
                      {typeof deletedPayment.receipt_url === 'string' && /^https?:\/\//.test(deletedPayment.receipt_url) && <a href={deletedPayment.receipt_url} target="_blank" rel="noreferrer">Открыть удалённый чек</a>}
                    </details>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </FilterableTable>
      </div>
    </div>
  );
}
