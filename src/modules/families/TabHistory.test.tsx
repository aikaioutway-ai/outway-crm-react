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
