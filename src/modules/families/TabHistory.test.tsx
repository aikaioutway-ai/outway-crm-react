import { fireEvent, render, screen } from '@testing-library/react';
import TabHistory from './TabHistory';

test('deleted receipt can be requested and opened from history', () => {
  render(<TabHistory audit={[
    { id:'deleted', action:'payment_delete', field:'payment', userName:'Кассир', createdAt:'2026-10-19', newValue:'{}', oldValue: JSON.stringify({ payment: { amount:500, payment_date:'2026-10-19', receipt_url:'https://example.com/receipt.png' } }) },
    { id:'other', action:'create_family', field:'family', userName:'Менеджер', createdAt:'2026-10-19', oldValue:'{}', newValue:'{}' },
  ]} />);
  fireEvent.click(screen.getByRole('button', {name:'Удалённые чеки'}));
  expect(screen.queryByText('Создана семья')).not.toBeInTheDocument();
  expect(screen.getByText('Платёж удалён')).toBeInTheDocument();
  expect(screen.getByRole('link', {name:'Открыть удалённый чек'})).toHaveAttribute('href','https://example.com/receipt.png');
});

test('shows readable Russian actions and changed fields in a table', () => {
  render(<TabHistory audit={[
    { id: 'change', action: 'update_family', field: 'family', userName: 'Анна', createdAt: '2026-10-20T10:00:00Z', oldValue: JSON.stringify({ parentName: 'Мария', phone: '111' }), newValue: JSON.stringify({ parentName: 'Мария', phone: '222' }) },
    { id: 'payment', action: 'Платёж', field: 'family_payment', userName: 'Анна', createdAt: '2026-10-20T11:00:00Z', oldValue: '"-"', newValue: '"500 сом на проверке"' },
  ]} />);
  expect(screen.getByRole('columnheader', { name: 'Дата' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Кто' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Что сделал' })).toBeInTheDocument();
  expect(screen.getByText('Телефон: 111 → 222')).toBeInTheDocument();
  expect(screen.getByText('Внёс платёж на проверку')).toBeInTheDocument();
  expect(screen.queryByText('family_payment')).not.toBeInTheDocument();
});

test('summarizes nested payment JSON and logistics comments without exposing their payload', () => {
  render(<TabHistory audit={[
    { id: 'payment', action: 'Изменение платежа', field: 'family_payment', userName: 'Кассир', createdAt: '2026-10-13', oldValue: JSON.stringify(JSON.stringify({ id: 'internal-id', amount: 26000, status: 'На проверке' })), newValue: JSON.stringify(JSON.stringify({ status: 'Отклонено' })) },
    { id: 'route', action: 'update', field: 'family', userName: 'Логист', createdAt: '2026-10-14', oldValue: JSON.stringify({ comment: '[Логистика] Трансфер №4: подробная история транспорта и стоимости' }), newValue: JSON.stringify({ comment: 'Изначально выбран Microbus' }) },
  ]} />);
  expect(screen.getByText('Чек отклонён')).toBeInTheDocument();
  expect(screen.getByText('Изменён трансфер')).toBeInTheDocument();
  expect(screen.queryByText(/internal-id|подробная история|Изначально выбран/)).not.toBeInTheDocument();
});

test('shows route and vehicle before and after, including legacy logistics notes', () => {
  render(<TabHistory audit={[
    { id: 'route', action: 'update', field: 'child_route', userName: 'Логист', createdAt: '2026-10-14', oldValue: JSON.stringify({ transfer_number: 4, vehicle_type: 'microbus' }), newValue: JSON.stringify({ transfer_number: 7, vehicle_type: 'minivan' }) },
    { id: 'legacy', action: 'update', field: 'family', userName: 'Логист', createdAt: '2026-10-14', oldValue: JSON.stringify({ comment: '[Логистика] Трансфер №4: изначально выбран Microbus, фактически определён Minivan; стоимость 6500 → 9500' }), newValue: JSON.stringify({ comment: '' }) },
  ]} />);
  expect(screen.getByText('Трансфер: № 4 → № 7; Тип ТС: Микроавтобус → Минивэн')).toBeInTheDocument();
  expect(screen.getByText('Тип ТС: Микроавтобус → Минивэн')).toBeInTheDocument();
  expect(screen.queryByText(/стоимость 6500/)).not.toBeInTheDocument();
});

test('database field changes show who, which child and every field before → after', () => {
  render(<TabHistory audit={[
    { id: 'f', action: 'field_change', field: 'child', userName: 'Зульфия', createdAt: '2026-10-29T10:00:00Z', subject: 'Иванов Иван',
      oldValue: JSON.stringify({ address: 'ул. Жумабека 233', transfer_id: '2', final_price: 6000, transfer_assigned_at: '2026-10-12' }),
      newValue: JSON.stringify({ address: 'ул. Ахунбаева 12', transfer_id: '4', final_price: 6500, transfer_assigned_at: '2026-10-20' }) },
    { id: 's', action: 'Сохранение карточки', field: 'family', userName: 'Зульфия', createdAt: '2026-10-29T10:00:01Z', oldValue: '"Черновик"', newValue: '"Изменения сохранены"' },
  ]} />);
  expect(screen.getByText('Изменены данные ребёнка')).toBeInTheDocument();
  expect(screen.getByText('Ребёнок: Иванов Иван')).toBeInTheDocument();
  expect(screen.getByText('Адрес: ул. Жумабека 233 → ул. Ахунбаева 12; Трансфер: № 2 → № 4; Стоимость: 6 000 → 6 500; Дата посадки: 12.10.2026 → 20.10.2026')).toBeInTheDocument();
  expect(screen.queryByText(/Черновик/)).not.toBeInTheDocument();
});

test('charges and discounts written by the database are readable', () => {
  render(<TabHistory audit={[
    { id: 'm', action: 'manual_charge', field: 'child', userName: 'Кайрат', createdAt: '2026-10-29T09:00:00Z', subject: 'Лазарева Аяна', oldValue: '""', newValue: JSON.stringify({ type: 'monthly', month: 10, year: 2026, amount: 6460 }) },
    { id: 'a', action: 'adjust_charge', field: 'charge', userName: 'Зульфия', createdAt: '2026-10-29T08:00:00Z', comment: 'Начисление убрано вручную', oldValue: JSON.stringify({ amount: 6175 }), newValue: JSON.stringify({ amount: 0 }) },
    { id: 'd', action: 'set_discount_choice', field: 'child', userName: 'Кайрат', createdAt: '2026-10-29T07:00:00Z', oldValue: JSON.stringify({ percent: 50 }), newValue: JSON.stringify({ percent: 0 }) },
  ]} />);
  expect(screen.getByText('Поставлено начисление')).toBeInTheDocument();
  expect(screen.getByText('Октябрь: 6 460')).toBeInTheDocument();
  expect(screen.getByText('Сумма: 6 175 → 0 · Начисление убрано вручную')).toBeInTheDocument();
  expect(screen.getByText('Скидка: 50% → 0%')).toBeInTheDocument();
});
