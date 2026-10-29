jest.mock('./CompensationFamilyFinance', () => ({ __esModule: true, default: () => <div>История платежей семьи</div> }));
import React from 'react';
import { fireEvent, render, screen, cleanup, within, waitFor } from '@testing-library/react';
import SpendingModule from './SpendingModule';
import { SCHOOL_TABS, isSchoolVisible } from '../families/constants';
const SCHOOL_TABS_FOR_TEST = () => SCHOOL_TABS.find(item => item.key !== 'ALL' && isSchoolVisible(item.key))!.key;

jest.mock('../../hooks/useCrmQueries', () => ({ useEmployees: () => ({ data: [{ id: 'staff1', fullName: 'Тестовый сотрудник', role: 'manager', status: 'active' }], isLoading: false, error: null }), useDriversTable: () => ({ data: [{ driverId: 'driver1', fullName: 'Тестовый водитель', status: 'active', transfers: [] }], isLoading: false, error: null }) }));

jest.mock('./CompensationChildSearch', () => ({ __esModule: true, default: ({ onSelect }: { onSelect: (row: unknown) => Promise<void> }) => <button type="button" onClick={() => onSelect({ familyId: 'family1', childName: 'Ребёнок', branchFilter: 'TIS' })}>Выбрать ребёнка</button> }));

beforeEach(() => { localStorage.clear(); localStorage.setItem('dt_cols:cashier_spending_records_v1', 'null'); ['cashier_spending_cogs_records_v1','cashier_spending_cogs_school_records_v1','cashier_spending_school_records_v1'].forEach(key => localStorage.setItem(`dt_cols:${key}`, 'null')); Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: () => 'expense-test' }); });

test('saves an independent expense, reloads it, and keeps personal totals separate', () => {
  render(<SpendingModule userId="owner" role="admin" />);
  fireEvent.click(screen.getByRole('button', { name: /^Личное / }));
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к новому расходу' }));
  fireEvent.change(screen.getByLabelText('Назначение'), { target: { value: 'Покупка продуктов' } });
  fireEvent.change(screen.getByLabelText('Сумма, сом'), { target: { value: '1500' } });
  fireEvent.change(screen.getByLabelText('Платёжное поручение'), { target: { value: 'ПП-42' } });
  fireEvent.change(screen.getByLabelText('Комментарий'), { target: { value: 'Комментарий к покупке' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  fireEvent.click(screen.getByRole('button', { name: /^Все Все расходы за период/ }));
  expect(screen.getByText('Покупка продуктов')).toBeInTheDocument();
  cleanup();
  render(<SpendingModule userId="owner" role="admin" />);
  fireEvent.click(screen.getByRole('button', { name: 'Карточки школ' }));
  fireEvent.click(screen.getByRole('button', { name: /^Все Все расходы за период/ }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к новому расходу' }));
  expect(screen.getByRole('button', { name: 'Сохранить выплаты' })).toBeDisabled();
  expect(localStorage.getItem('outway-spending-v1:owner')).toBe('broken');
});

test('creation replaces school overview and follows the selected category', () => {
  render(<SpendingModule userId="owner" role="admin" />);
  fireEvent.click(screen.getByRole('button', { name: /^COGS / }));
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к новому расходу' }));
  expect(screen.queryByRole('button', { name: /Добавить расход/ })).not.toBeInTheDocument();
  if (screen.queryByRole('dialog')) fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно расхода' }));
  fireEvent.click(screen.getByRole('button', { name: 'Карточки школ' }));
  expect(screen.getByRole('group', { name: 'Расходы по школам' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Таблица расходов' }));
  expect(screen.getByRole('region', { name: 'Записи расходов' })).toBeInTheDocument();
  if (screen.queryByRole('dialog')) fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно расхода' }));
  fireEvent.click(screen.getByRole('button', { name: 'Карточки школ' }));
  expect(screen.getByRole('group', { name: 'Расходы по школам' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к новому расходу' }));
  expect(screen.getByRole('group', { name: 'Расходы по школам' })).toBeInTheDocument();
  if (screen.queryByRole('dialog')) fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно расхода' }));
  fireEvent.click(screen.getByRole('button', { name: /^OPEX / }));
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к новому расходу' }));
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
  const openClient = jest.fn(async () => {});
  render(<SpendingModule userId="opex-owner" role="admin" onOpenClient={openClient} />);
  if (screen.queryByRole('dialog')) fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно расхода' }));
  fireEvent.click(screen.getByRole('button', { name: /^OPEX / }));
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к новому расходу' }));
  expect(screen.getByRole('form', { name: 'Новый расход OPEX' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Аванс' })).toBeInTheDocument();
  expect(within(screen.getByRole('group', { name: 'Вид расхода' })).getAllByRole('button').map(button => button.textContent)).toEqual(['Аванс', 'Зарплата']);
  fireEvent.click(screen.getByRole('button', { name: 'IT' }));
  expect(screen.getByRole('button', { name: 'Подписки' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Пополнение баланса' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Компенсации' }));
  expect(screen.queryByRole('button', { name: 'Такси' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Возврат' }));
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать ребёнка' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ребёнок' })).toBeInTheDocument());
  expect(openClient).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Ребёнок' }));
  expect(openClient).toHaveBeenCalledWith('family1');
  fireEvent.click(screen.getByRole('button', { name: 'Убрать выбранного ребёнка' }));
  expect(screen.queryByRole('button', { name: 'Ребёнок' })).not.toBeInTheDocument();
  expect(screen.queryByText('История платежей семьи')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать ребёнка' }));
  expect(screen.queryByLabelText('За что')).not.toBeInTheDocument();
  expect(screen.getByText('История платежей семьи')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Сумма, сом'), { target: { value: '700' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(JSON.parse(localStorage.getItem('outway-spending-v1:opex-owner') || '[]')[0]).toMatchObject({ subcategory: 'Возврат родителю', amount: 700, operationType: 'customer_refund' });
});

test('office payroll retains the chosen department when switching advance to salary and saves it', () => {
  render(<SpendingModule userId="payroll-owner" role="admin" />);
  if (screen.queryByRole('dialog')) fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно расхода' }));
  fireEvent.click(screen.getByRole('button', { name: /^OPEX / }));
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к новому расходу' }));
  const departments = screen.getByRole('group', { name: 'Отдел выплаты' });
  expect(within(departments).getAllByRole('button')).toHaveLength(5);
  fireEvent.click(within(departments).getByRole('button', { name: 'Сервис' }));
  const picker = screen.getByRole('dialog', { name: 'Сотрудники и суммы' });
  fireEvent.change(within(picker).getByLabelText('Сумма Тестовый сотрудник'), { target: { value: '25000' } });
  fireEvent.click(within(picker).getByRole('button', { name: 'Готово' }));
  fireEvent.click(within(screen.getByRole('group', { name: 'Вид расхода' })).getByRole('button', { name: 'Зарплата' }));
  expect(screen.getByRole('button', { name: 'Выбрать: Отдел' })).toHaveTextContent('Отдел клиентского сервиса');
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать: За период' }));
  const periodChecks = screen.getAllByRole('button', { name: /^\d{4}-\d{2}$/ });
  fireEvent.click(periodChecks[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(JSON.parse(localStorage.getItem('outway-spending-v1:payroll-owner') || '[]')[0]).toMatchObject({ departmentKey: 'service', subcategory: 'Зарплата офиса', amount: 25000 });
});


test('rent stores an amount against selected months without a recipient field', () => {
  render(<SpendingModule userId="rent-owner" role="admin" />);
  if (screen.queryByRole('dialog')) fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно расхода' }));
  fireEvent.click(screen.getByRole('button', { name: /^OPEX / }));
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к новому расходу' }));
  fireEvent.click(screen.getByRole('button', { name: 'Офис' }));
  expect(screen.queryByLabelText('Получатель')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('За что')).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: /^\d{4}-\d{2}$/ })[0]);
  fireEvent.click(screen.getAllByRole('button', { name: /^\d{4}-\d{2}$/ })[1]);
  fireEvent.change(screen.getByLabelText('Сумма, сом'), { target: { value: '1000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  const rows = JSON.parse(localStorage.getItem('outway-spending-v1:rent-owner') || '[]');
  expect(rows).toHaveLength(2);
  expect(rows.map((row: { amount: number }) => row.amount)).toEqual([500, 500]);
  expect(rows[0].salaryPeriodKey).toMatch(/^\d{4}-\d{2}$/);
});


test('taxes use departments, employee selection and monthly periods', () => {
  render(<SpendingModule userId="tax-owner" role="admin" />);
  if (screen.queryByRole('dialog')) fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно расхода' }));
  fireEvent.click(screen.getByRole('button', { name: /^OPEX / }));
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к новому расходу' }));
  fireEvent.click(screen.getByRole('button', { name: 'Налоги и взносы' }));
  fireEvent.click(within(screen.getByRole('group', { name: 'Отдел выплаты' })).getByRole('button', { name: 'Сервис' }));
  const picker = screen.getByRole('dialog', { name: 'Сотрудники и суммы' });
  fireEvent.change(within(picker).getByLabelText('Сумма Тестовый сотрудник'), { target: { value: '1500' } });
  fireEvent.click(within(picker).getByRole('button', { name: 'Готово' }));
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать: За период' }));
  fireEvent.click(screen.getAllByRole('button', { name: /^\d{4}-\d{2}$/ })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(JSON.parse(localStorage.getItem('outway-spending-v1:tax-owner') || '[]')[0]).toMatchObject({ subcategory: 'Социальный фонд', employeeId: 'staff1', amount: 1500 });
});

test('revenue tax saves selected months without schools or recipient', () => {
  render(<SpendingModule userId="owner" role="admin" />);
  fireEvent.click(screen.getByRole('button', { name: /^Revenue Tax / }));
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к новому расходу' }));
  expect(screen.getAllByText('Налоги')).toHaveLength(2);
  expect(screen.queryByText('К какой школе относится расход')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Получатель')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Назначение платежа'), { target: { value: 'Налог с выручки' } });
  fireEvent.change(screen.getByLabelText('Сумма налога, сом'), { target: { value: '3500' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Новый расход Revenue Tax' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Выберите налоговый период');
  const months = screen.getAllByRole('button', { name: /^\d{4}-\d{2}$/ });
  const selected = months.slice(0, 2).map(month => month.getAttribute('aria-label'));
  fireEvent.click(months[0]);
  fireEvent.click(months[1]);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(JSON.parse(localStorage.getItem('outway-spending-v1:owner')!)[0]).toMatchObject({ category: 'Revenue Tax', taxPeriods: selected, recipient: '', amount: 3500 });
  expect(screen.queryByRole('table', { name: 'Расходы по школам' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Таблица расходов' }));
  fireEvent.click(screen.getByRole('button', { name: 'Редактировать Налог с выручки' }));
  selected.forEach(month => expect(screen.getByRole('button', { name: month! })).toHaveAttribute('aria-pressed', 'true'));
});

test.each(['Доп. Выезды', 'Logistics'])('%s uses the COGS picker and route with quantity instead of periods', category => {
  render(<SpendingModule userId="owner" role="admin" />);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${category} `) }));
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к новому расходу' }));
  expect(screen.queryByText('Периоды выплаты')).not.toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Подкатегория' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'TIS' }));
  fireEvent.click(screen.getByTitle('Резерв'));
  fireEvent.change(screen.getByLabelText('Маршрут'), { target: { value: 'Школа — музей' } });
  fireEvent.change(screen.getByLabelText('Количество'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Тестовый водитель' }));
  fireEvent.change(screen.getByLabelText('Сумма для Тестовый водитель'), { target: { value: '1250.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить выплаты' }));
  expect(JSON.parse(localStorage.getItem('outway-spending-v1:owner')!)[0]).toMatchObject({ category, driverId: 'driver1', recipient: 'Тестовый водитель', schoolKey: 'TIS', description: 'Школа — музей', unitPrice: 1250.5, quantity: 3, amount: 3751.5 });
});

test('opens all records from the form header and returns with one click', () => {
  render(<SpendingModule userId="owner" role="admin" />);
  fireEvent.click(screen.getByRole('button', { name: 'Таблица расходов' }));
  expect(screen.getByRole('region', { name: 'Записи расходов' })).toBeInTheDocument();
  expect(screen.queryByRole('form', { name: 'Новая выплата COGS' })).not.toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Вид расходов' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к новому расходу' }));
  expect(screen.getByRole('form', { name: 'Новая выплата COGS' })).toBeInTheDocument();
});

jest.mock('../../services/spendingService', () => ({ fetchSpendingEntries: jest.fn(), saveSpendingEntries: jest.fn(), deleteSpendingEntry: jest.fn() }));
const cloud = jest.requireMock('../../services/spendingService');
test('loads copied finance records and keeps the original classification visible', async () => {
  cloud.saveSpendingEntries.mockResolvedValue(undefined);
  cloud.fetchSpendingEntries.mockResolvedValue([{ id:'finance:v2_expenses:one', category:'OPEX',subcategory:'Аренда',salaryPeriodKey:'2026-10',date:'2026-10-01',amount:1250,description:'Аренда из Финансов',recipient:'',method:'Безналичные',sourceRef:'v2_expenses:one',originalCategory:'office',originalSubcategory:'Аренда' }]);
  render(<SpendingModule userId="owner" role="admin" sessionToken="session" periodKey="ALL" />);
  await waitFor(() => expect(cloud.fetchSpendingEntries).toHaveBeenCalledWith('session'));
  fireEvent.click(screen.getByRole('button', { name: /^Все Все расходы за период/ }));
  expect(await screen.findByText('Аренда из Финансов')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name:'Редактировать Аренда из Финансов' }));
  expect(screen.getByRole('form',{name:'Новый расход OPEX'})).toBeInTheDocument();
  cloud.saveSpendingEntries.mockRejectedValueOnce(new Error('Сбой сохранения'));
  fireEvent.change(screen.getByLabelText('Сумма, сом'),{target:{value:'1500'}});
  fireEvent.click(screen.getByRole('button',{name:'Сохранить'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Сбой сохранения');
  expect(screen.getByRole('form',{name:'Новый расход OPEX'})).toBeInTheDocument();
});

test('all-expenses tile follows the period and access rights, independently of category and search', () => {
  const base = {subcategory:'Прочее',description:'Расход',recipient:'',method:'Безналичные'};
  localStorage.setItem('outway-spending-v1:totals',JSON.stringify([
    {...base,id:'oct',category:'Logistics',date:'2026-10-01',amount:100},
    {...base,id:'sep',category:'Logistics',date:'2026-09-01',amount:50},
    {...base,id:'personal',category:'Личное',date:'2026-10-01',amount:500},
  ]));
  const view=render(<SpendingModule userId="totals" role="admin" periodKey="10" />);
  expect(screen.getByRole('button',{name:/^Все Все расходы за период/})).toHaveTextContent('600 сом');
  expect(screen.getByRole('button',{name:/^Личное /})).toBeInTheDocument();
  view.rerender(<SpendingModule userId="totals" role="admin" periodKey="ALL" searchQuery="Нет совпадений" />);
  expect(screen.getByRole('button',{name:/^Все Все расходы за период/})).toHaveTextContent('650 сом');
  view.rerender(<SpendingModule userId="totals" role="cashier" periodKey="ALL" />);
  const all=screen.getByRole('button',{name:/^Все Все расходы за период/});
  expect(all).toHaveTextContent('150 сом');
  expect(all).toHaveClass('is-expanded');
  expect(screen.queryByRole('button',{name:/^Личное /})).not.toBeInTheDocument();
  fireEvent.click(all);
  expect(screen.getByRole('region',{name:'Записи расходов'})).toBeInTheDocument();
  expect(all).toHaveAttribute('aria-pressed','true');
  expect(screen.getByRole('button',{name:/^Logistics /})).toHaveAttribute('aria-pressed','false');
});

test('editing uses the creation forms and switching category changes the form without replacing the record',()=>{
  localStorage.setItem('outway-spending-v1:edit',JSON.stringify([{id:'existing',category:'CAPEX',subcategory:'Мебель',date:'2026-10-01',amount:100,description:'Стол',recipient:'Поставщик',method:'Безналичные',paymentOrderNumber:'42',comment:'Сохранить комментарий'}]));
  render(<SpendingModule userId="edit" role="admin" periodKey="ALL"/>);
  fireEvent.click(screen.getByRole('button',{name:/^Все Все расходы за период/}));
  fireEvent.click(screen.getByRole('button',{name:'Редактировать Стол'}));
  expect(screen.getByRole('form',{name:'Новый расход CAPEX'})).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Назначение'),{target:{value:'Стол после правки'}});
  fireEvent.change(screen.getByRole('combobox',{name:'Категория расхода'}),{target:{value:'COGS'}});
  expect(screen.getByRole('form',{name:'Новая выплата COGS'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Выбрать водителей'})).toBeInTheDocument();
  expect(screen.getByLabelText('Комментарий')).toHaveValue('Сохранить комментарий');
  fireEvent.change(screen.getByRole('combobox',{name:'Категория расхода'}),{target:{value:'CAPEX'}});
  expect(screen.getByRole('form',{name:'Новый расход CAPEX'})).toBeInTheDocument();
  expect(screen.getByLabelText('Назначение')).toHaveValue('Стол после правки');
  expect(screen.getByLabelText('Сумма, сом')).toHaveValue(100);
  fireEvent.click(screen.getByRole('button',{name:'Сохранить'}));
  expect(JSON.parse(localStorage.getItem('outway-spending-v1:edit')!)).toEqual([expect.objectContaining({id:'existing',category:'CAPEX',description:'Стол после правки',amount:100})]);
});

test('historical non-driver logistics expenses remain ordinary expenses when editing',()=>{
  localStorage.setItem('outway-spending-v1:ordinary',JSON.stringify([{id:'ordinary',category:'Logistics',subcategory:'Прочее',date:'2026-10-01',amount:100,description:'Такси',recipient:'',method:'Безналичные'}]));
  render(<SpendingModule userId="ordinary" role="admin" periodKey="ALL"/>);
  fireEvent.click(screen.getByRole('button',{name:/^Все Все расходы за период/}));
  fireEvent.click(screen.getByRole('button',{name:'Редактировать Такси'}));
  expect(screen.getByRole('form',{name:'Новый расход Logistics'})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Выбрать водителей'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Сохранить'}));
  expect(JSON.parse(localStorage.getItem('outway-spending-v1:ordinary')!)[0]).toMatchObject({id:'ordinary',category:'Logistics',subcategory:'Прочее',amount:100});
});

test('all-records buttons stay inside the chosen category and only the All tile opens every category',()=>{
  const base={date:'2026-10-01',amount:100,recipient:'',method:'Безналичные'};
  localStorage.setItem('outway-spending-v1:scope',JSON.stringify([
    {...base,id:'cogs',category:'COGS',subcategory:'Авансы водителям',description:'Выплата COGS',comment:'Комментарий COGS'},
    {...base,id:'opex',category:'OPEX',subcategory:'Аренда',description:'Аренда OPEX'},
    {...base,id:'personal',category:'Личное',subcategory:'Прочее',description:'Личный расход'},
  ]));
  render(<SpendingModule userId="scope" role="admin" periodKey="ALL"/>);
  fireEvent.click(screen.getByRole('button',{name:'Таблица расходов'}));
  expect(screen.getByText('Комментарий COGS')).toBeInTheDocument();
  expect(screen.queryByText('Аренда OPEX')).not.toBeInTheDocument();
  expect(screen.queryByText('Личный расход')).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:/^COGS /})).toHaveAttribute('aria-pressed','true');
  fireEvent.click(screen.getByRole('button',{name:/^OPEX /}));
  fireEvent.click(screen.getByRole('button',{name:'Таблица расходов'}));
  expect(screen.getByText('Аренда OPEX')).toBeInTheDocument();
  expect(screen.queryByText('Комментарий COGS')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/^Все Все расходы за период/}));
  expect(screen.getByText('Выплата COGS')).toBeInTheDocument();
  expect(screen.getByText('Аренда OPEX')).toBeInTheDocument();
  expect(screen.getByText('Личный расход')).toBeInTheDocument();
});

test.each(['OPEX', 'CAPEX', 'Revenue Tax', 'Личное'])('%s supports tiles and category records', category => {
  render(<SpendingModule userId="owner" role="admin" />);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${category} `) }));
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к новому расходу' }));
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно расхода' }));
  fireEvent.click(screen.getByRole('button', { name: 'Плиточный вид' }));
  expect(screen.getByRole('group', { name: 'Расходы по статьям' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Таблица расходов' }));
  expect(screen.getByRole('region', { name: 'Записи расходов' })).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Расходы по статьям' })).not.toBeInTheDocument();
});


test('only the current expense view is highlighted', () => {
  render(<SpendingModule userId="owner" role="admin" />);
  fireEvent.click(screen.getByRole('button', { name: /^COGS / }));
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к новому расходу' }));
  const dialog = screen.getByRole('dialog', { name: 'Новый расход' });
  expect(within(dialog).getAllByRole('button', { name: 'Закрыть окно расхода' })).toHaveLength(1);
  expect(within(dialog).queryByRole('button', { name: 'Карточки школ' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно расхода' }));
  expect(screen.getByRole('button', { name: 'Карточки школ' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Вернуться к новому расходу' })).toHaveAttribute('aria-pressed', 'false');
});

test('opens tiles by default and keeps tiles on category selection', () => {
  render(<SpendingModule userId="owner" role="admin" />);
  expect(screen.getByRole('group', { name: 'Расходы по школам' })).toBeInTheDocument();
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^OPEX / }));
  expect(screen.getByRole('group', { name: 'Расходы по статьям' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Записи расходов' })).not.toBeInTheDocument();
});

test('new expense opens inline and preserves the records view on close', () => {
  render(<SpendingModule userId="owner" role="admin" />);
  fireEvent.click(screen.getByRole('button', { name: 'Таблица расходов' }));
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к новому расходу' }));
  expect(screen.getByRole('dialog', { name: 'Новый расход' })).toHaveAttribute('aria-modal', 'false');
  expect(screen.getByRole('dialog', { name: 'Новый расход' }).closest('.spending-workspace')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно расхода' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Записи расходов' })).toBeInTheDocument();
});

test('school selection advances directly to transfer selection', () => {
  render(<SpendingModule userId="owner" role="admin" />);
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к новому расходу' }));
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать: Школа' }));
  expect(screen.getByRole('dialog', { name: 'Выбор параметров выплаты' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'TIS' }));
  expect(screen.getByRole('dialog', { name: 'Выбор параметров выплаты' })).toHaveAttribute('data-panel', 'transfer');
  expect(screen.getByRole('button', { name: 'Выбрать: Школа' })).toHaveTextContent('TIS');
});

test('payment type stays in summary and all four quarters share one panel', () => {
  render(<SpendingModule userId="owner" role="admin" />);
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к новому расходу' }));
  expect(screen.getByRole('button', { name: 'Аванс' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать: За период' }));
  ['1-й квартал','2-й квартал','3-й квартал','4-й квартал'].forEach(label => expect(screen.getByText(label)).toBeInTheDocument());
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Выбор параметров выплаты' })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Новый расход' })).toBeInTheDocument();
});

test('sidebar changes the category while keeping a new expense open', () => {
  render(<SpendingModule userId="owner" role="admin" />);
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к новому расходу' }));
  fireEvent.click(screen.getByRole('button', { name: /^CAPEX / }));
  expect(screen.getByRole('dialog', { name: 'Новый расход' })).toBeInTheDocument();
  expect(screen.getByRole('form', { name: 'Новый расход CAPEX' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Личное / }));
  expect(screen.getByRole('form', { name: 'Новый расход Личное' })).toBeInTheDocument();
});

test('switching category keeps the table view and shows that category records', () => {
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem('outway-spending-v1:table-owner', JSON.stringify([
    { id: 'c1', category: 'COGS', subcategory: 'Авансы водителям', date: today, amount: 100, description: 'Аванс водителю', recipient: '', method: 'Наличные' },
    { id: 'o1', category: 'OPEX', subcategory: 'Аренда', date: today, amount: 200, description: 'Аренда офиса', recipient: '', method: 'Наличные' },
  ]));
  render(<SpendingModule userId="table-owner" role="admin" />);
  if (screen.queryByRole('dialog')) fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно расхода' }));
  fireEvent.click(screen.getByRole('button', { name: /^COGS / }));
  if (screen.queryByRole('dialog')) fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно расхода' }));
  fireEvent.click(screen.getByRole('button', { name: 'Таблица расходов' }));
  expect(screen.getByRole('region', { name: 'Записи расходов' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^OPEX / }));
  expect(screen.getByRole('region', { name: 'Записи расходов' })).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Расходы по школам' })).not.toBeInTheDocument();
  expect(screen.getByText('Аренда офиса')).toBeInTheDocument();
  expect(screen.queryByText('Аванс водителю')).not.toBeInTheDocument();
});

test('editing a record without an employee in office payroll keeps its amount for the chosen employee', () => {
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem('outway-spending-v1:carry-owner', JSON.stringify([
    { id: 'moved', category: 'OPEX', subcategory: 'Авансы сотрудникам', date: today, amount: 10000, description: 'Аванс', recipient: '', method: 'Наличные', comment: 'перенос' },
  ]));
  render(<SpendingModule userId="carry-owner" role="admin" />);
  if (screen.queryByRole('dialog')) fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно расхода' }));
  fireEvent.click(screen.getByRole('button', { name: /^OPEX / }));
  if (screen.queryByRole('dialog')) fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно расхода' }));
  fireEvent.click(screen.getByRole('button', { name: 'Таблица расходов' }));
  fireEvent.click(screen.getByRole('button', { name: 'Редактировать Аванс' }));
  expect(document.querySelector('.payment-footer-total .payment-carried')).toHaveTextContent(/^10.000/);
  fireEvent.click(within(screen.getByRole('group', { name: 'Отдел выплаты' })).getByRole('button', { name: 'Сервис' }));
  const picker = screen.getByRole('dialog', { name: 'Сотрудники и суммы' });
  expect(within(picker).getByLabelText('Сумма Тестовый сотрудник')).toHaveAttribute('placeholder', expect.stringMatching(/^10.000$/));
  fireEvent.click(within(picker).getByRole('checkbox'));
  expect(within(picker).getByLabelText('Сумма Тестовый сотрудник')).toHaveValue(10000);
});

test('extra trip school tiles show how many trips the school had', () => {
  const today = new Date().toISOString().slice(0, 10);
  const school = SCHOOL_TABS_FOR_TEST();
  localStorage.setItem('outway-spending-v1:trip-owner', JSON.stringify([
    { id: 't1', category: 'Доп. Выезды', subcategory: 'Оплата водителю', date: today, amount: 6000, quantity: 3, unitPrice: 2000, description: 'Бишкек — Иссык-Куль', recipient: 'Водитель', method: 'Наличные', schoolKey: school },
    { id: 't2', category: 'Доп. Выезды', subcategory: 'ГСМ', date: today, amount: 500, description: 'Бензин', recipient: '', method: 'Наличные', schoolKey: school },
  ]));
  render(<SpendingModule userId="trip-owner" role="admin" />);
  if (screen.queryByRole('dialog')) fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно расхода' }));
  fireEvent.click(screen.getByRole('button', { name: /^Доп\. Выезды / }));
  if (screen.queryByRole('dialog')) fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно расхода' }));
  if (screen.queryByRole('region', { name: 'Записи расходов' })) fireEvent.click(screen.getByRole('button', { name: 'Карточки школ' }));
  expect(screen.getByText('3 выезда')).toBeInTheDocument();
});
