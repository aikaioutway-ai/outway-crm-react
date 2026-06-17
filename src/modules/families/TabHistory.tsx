import React from 'react';
import { Section } from './DrawerUI';

interface AuditEntry {
  id: string; userName: string; action: string;
  field: string; oldValue: string; newValue: string; createdAt: string;
}

const ACTION_LABEL: Record<string, string> = {
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
  status:           'Статус',
  vehicle_type:     'Тип транспорта',
  zone:             'Зона',
  amount:           'Сумма',
  payment_method:   'Способ оплаты',
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

function humanizeValue(raw: string): string {
  if (!raw || raw === '""' || raw === 'null' || raw === '{}' || raw === '[]') return '';
  // Убираем JSON кавычки если простая строка
  let val = raw;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') val = parsed;
    else if (typeof parsed === 'number') val = String(parsed);
    else if (typeof parsed === 'boolean') val = String(parsed);
    else if (parsed && typeof parsed === 'object') {
      // Берём только значимые поля из объекта
      const keys = ['status', 'amount', 'vehicle_type', 'zone', 'child_name', 'parent_name'];
      const found = keys.find(k => parsed[k] !== undefined);
      val = found ? String(parsed[found]) : '';
    }
  } catch { /* не JSON — оставляем как есть */ }

  return VALUE_LABEL[val] ?? val;
}

export default function TabHistory({ audit }: { audit: AuditEntry[] }) {
  if (audit.length === 0) return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <div style={{ fontSize: 24, marginBottom: 6 }}>📋</div>
      <div style={{ color: 'var(--text-2)', fontSize: 12 }}>История изменений пуста</div>
    </div>
  );

  return (
    <Section title={`История (${audit.length})`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {audit.map(entry => {
          const actionText = ACTION_LABEL[entry.action] ?? entry.action;
          const fieldText = FIELD_LABEL[entry.field] ?? (entry.field || '');
          const oldText = humanizeValue(entry.oldValue);
          const newText = humanizeValue(entry.newValue);
          const hasChange = oldText || newText;

          return (
            <div key={entry.id} style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 12px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{actionText}</span>
                <span style={{ fontSize: 10, color: 'var(--text-2)' }}>
                  {entry.createdAt?.slice(0, 16).replace('T', ' ')}
                </span>
              </div>
              {fieldText && (
                <div style={{ fontSize: 10, color: 'var(--text-2)', marginBottom: 2 }}>
                  <span style={{ fontWeight: 600 }}>{fieldText}</span>
                </div>
              )}
              {hasChange && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 10, flexWrap: 'wrap' }}>
                  {oldText && (
                    <span style={{ background: '#FFEBEE', color: '#C62828', borderRadius: 4, padding: '2px 6px' }}>
                      {oldText.length > 60 ? oldText.slice(0, 60) + '...' : oldText}
                    </span>
                  )}
                  {oldText && newText && <span style={{ color: 'var(--text-2)' }}>→</span>}
                  {newText && (
                    <span style={{ background: '#E8F5E9', color: '#2E7D32', borderRadius: 4, padding: '2px 6px' }}>
                      {newText.length > 60 ? newText.slice(0, 60) + '...' : newText}
                    </span>
                  )}
                </div>
              )}
              <div style={{ fontSize: 9, color: 'var(--text-2)', marginTop: 4, fontWeight: 500 }}>
                👤 {entry.userName}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
