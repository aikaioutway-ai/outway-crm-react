import React from 'react';
import { fireEvent, render, screen, cleanup, within, waitFor } from '@testing-library/react';
import SpendingModule from './SpendingModule';

jest.mock('../../hooks/useCrmQueries', () => ({ useEmployees: () => ({ data: [{ id: 'staff1', fullName: 'Тестовый сотрудник', role: 'manager', status: 'active' }], isLoading: false, error: null }), useDriversTable: () => ({ data: [], isLoading: false, error: null }) }));

jest.mock('./CompensationChildSearch', () => ({ __esModule: true, default: ({ onSelect }: { onSelect: (row: unknown) => Promise<void> }) => <button type="button" onClick={() => onSelect({ familyId: 'family1', childName: 'Ребёнок', branchFilter: 'TIS' })}>Выбрать ребёнка</button> }));

beforeEach(() => { localStorage.clear(); Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: () => 'expense-test' }); });

test('saves an independent expense, reloads it, and keeps personal totals separate', () => {
  render(<SpendingModule userId="owner" role="admin" />);
  fireEvent.click(screen.getByRole('button', { name: /^Личное / }));
  fireEvent.change(screen.getByLabelText('Назначение'), { target: { value: 'Покупка продуктов' } });
  fireEvent.change(screen.getByLabelText('Сумма, сом'), { target: { value: '1500' } });
  fireEvent.change(screen.getByLabelText('Платёжное поручение'), { target: { value: 'ПП-42' } });
  fireEvent.change(screen.getByLabelText('Комментарий'), { target: { value: 'Комментарий к покупке' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  fireEvent.click(screen.getByRole('button', { name: 'Все расходы' }));
  expect(screen.getByText('Покупка продуктов')).toBeInTheDocument();
  cleanup();
  render(<SpendingModule userId="owner" role="admin" />);
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть форму выплаты' }));
  fireEvent.click(screen.getByRole('button', { name: 'Все расходы' }));
  expect(screen.getByText('Покупка продуктов')).toBeInTheDocument();
  expect(screen.getByText('ПП-42')).toBeInTheDocument();
  expect(screen.getByText('Комментарий к покупке')).toBeInTheDocument();
  cleanup();
  render(<SpendingModule userId="other" role="admin" />);
  expect(screen.queryByText('Покупка продуктов')).not.toBeInTheDocument();
});

test('cashier cannot select personal category', () => {
  render(<SpendingModule userId="cashier" role="cashier" />);
  expect(screen.queryByText('Личное')).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Личное' })).not.toBeInTheDocument();
});

test('corrupt storage is not overwritten', () => {
  localStorage.setItem('outway-spending-v1:owner', 'broken');
  render(<SpendingModule userId="owner" role="admin" />);
  expect(screen.getByRole('alert')).toHaveTextContent('Сохранение отключено');
  expect(screen.getByRole('button', { name: 'Сохранить выплаты' })).toBeDisabled();
  expect(localStorage.getItem('outway-spending-v1:owner')).toBe('broken');
});

test('creation replaces school overview and follows the selected category', () => {
  render(<SpendingModule userId="owner" role="admin" />);
  fireEvent.click(screen.getByRole('button', { name: /^COGS / }));
  expect(screen.queryByRole('button', { name: /Добавить расход/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть форму выплаты' }));
  expect(screen.getByRole('table', { name: 'Выплаты по школам' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к новому расходу' }));
  expect(screen.queryByRole('table', { name: 'Выплаты по школам' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^OPEX / }));
  expect(screen.queryByRole('form', { name: 'Новая выплата COGS' })).not.toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Статья OPEX' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'К какой школе относится расход' })).not.toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Подкатегория' })).not.toBeInTheDocument();
  expect(screen.queryByText('Услуги специалистов')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Офис' }));
  expect(screen.getByRole('button', { name: 'Офис' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('form', { name: 'Новый расход OPEX' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  expect(screen.queryByLabelText('Категория')).not.toBeInTheDocument();
});


test('OPEX selects a kind beneath its category and saves a refund as a separate operation type', async () => {
  render(<SpendingModule userId="opex-owner" role="admin" onOpenClient={async () => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /^OPEX / }));
  expect(screen.getByRole('form', { name: 'Новый расход OPEX' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Аванс' })).toBeInTheDocument();
  expect(within(screen.getByRole('group', { name: 'Вид расхода' })).getAllByRole('button').map(button => button.textContent)).toEqual(['Аванс', 'ЗП']);
  fireEvent.click(screen.getByRole('button', { name: 'IT' }));
  expect(screen.getByRole('button', { name: 'Подписки' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Пополнение баланса' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Компенсации' }));
  expect(screen.queryByRole('button', { name: 'Такси' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Возврат' }));
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать ребёнка' }));
  await waitFor(() => expect(screen.getByText('Ребёнок')).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('За что'), { target: { value: 'Возврат оплаты' } });
  fireEvent.change(screen.getByLabelText('Сумма, сом'), { target: { value: '700' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(JSON.parse(localStorage.getItem('outway-spending-v1:opex-owner') || '[]')[0]).toMatchObject({ subcategory: 'Возврат родителю', amount: 700, operationType: 'customer_refund' });
});

test('office payroll retains the chosen department when switching advance to salary and saves it', () => {
  render(<SpendingModule userId="payroll-owner" role="admin" />);
  fireEvent.click(screen.getByRole('button', { name: /^OPEX / }));
  const departments = screen.getByRole('group', { name: 'Отдел выплаты' });
  expect(within(departments).getAllByRole('button')).toHaveLength(5);
  fireEvent.click(within(departments).getByRole('button', { name: 'Сервис' }));
  const picker = screen.getByRole('dialog', { name: 'Сотрудники и суммы' });
  fireEvent.change(within(picker).getByLabelText('Сумма Тестовый сотрудник'), { target: { value: '25000' } });
  fireEvent.click(within(picker).getByRole('button', { name: 'Готово' }));
  fireEvent.click(within(screen.getByRole('group', { name: 'Вид расхода' })).getByRole('button', { name: 'ЗП' }));
  expect(within(departments).getByRole('button', { name: 'Сервис' })).toHaveAttribute('aria-pressed', 'true');
  const periodChecks = screen.getAllByRole('checkbox');
  fireEvent.click(periodChecks[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(JSON.parse(localStorage.getItem('outway-spending-v1:payroll-owner') || '[]')[0]).toMatchObject({ departmentKey: 'service', subcategory: 'Зарплата офиса', amount: 25000 });
});


test('rent stores an amount against selected months without a recipient field', () => {
  render(<SpendingModule userId="rent-owner" role="admin" />);
  fireEvent.click(screen.getByRole('button', { name: /^OPEX / }));
  fireEvent.click(screen.getByRole('button', { name: 'Офис' }));
  expect(screen.queryByLabelText('Получатель')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('За что')).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  fireEvent.click(screen.getAllByRole('checkbox')[1]);
  fireEvent.change(screen.getByLabelText('Сумма, сом'), { target: { value: '1000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  const rows = JSON.parse(localStorage.getItem('outway-spending-v1:rent-owner') || '[]');
  expect(rows).toHaveLength(2);
  expect(rows.map((row: { amount: number }) => row.amount)).toEqual([500, 500]);
  expect(rows[0].salaryPeriodKey).toMatch(/^\d{4}-\d{2}$/);
});


test('taxes use departments, employee selection and monthly periods', () => {
  render(<SpendingModule userId="tax-owner" role="admin" />);
  fireEvent.click(screen.getByRole('button', { name: /^OPEX / }));
  fireEvent.click(screen.getByRole('button', { name: 'Налоги' }));
  fireEvent.click(within(screen.getByRole('group', { name: 'Отдел выплаты' })).getByRole('button', { name: 'Сервис' }));
  const picker = screen.getByRole('dialog', { name: 'Сотрудники и суммы' });
  fireEvent.change(within(picker).getByLabelText('Сумма Тестовый сотрудник'), { target: { value: '1500' } });
  fireEvent.click(within(picker).getByRole('button', { name: 'Готово' }));
  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(JSON.parse(localStorage.getItem('outway-spending-v1:tax-owner') || '[]')[0]).toMatchObject({ subcategory: 'Социальный фонд', employeeId: 'staff1', amount: 1500 });
});
