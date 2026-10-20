import { createExpense } from '../../services/expenseService';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EmployeeAdvanceModal from './EmployeeAdvanceModal';
import { createV2DriverAdvance } from '../../services/crmV2Service';
import { createEmployeeAdvance } from '../../services/employeeService';

jest.mock('../../services/expenseService', () => ({ createExpense: jest.fn().mockResolvedValue({id:'saved'}) }));
jest.mock('../../services/crmV2Service', () => ({ createV2DriverAdvance: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../services/employeeService', () => ({ createEmployeeAdvance: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../services/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('../../hooks/useCrmQueries', () => ({
  useEmployees: () => ({ data: [{ id: 'office', fullName: 'Офисный сотрудник', status: 'active', role: 'manager' }] }),
  useDriversTable: () => ({ data: [
    { driverId: 'driver-a', fullName: 'Водитель А', status: 'active', transfers: [{ id: 'transfer-a', transferNumber: 3, branchCode: 'TENSAY', branchShort: 'TIS' }] },
    { driverId: 'driver-b', fullName: 'Водитель Б', status: 'active', transfers: [{ id: 'transfer-b', transferNumber: 5, branchCode: 'ERUDIT', branchShort: 'ERU' }] },
    { driverId: 'inactive', fullName: 'Уволенный водитель', status: 'dismissed', transfers: [] },
  ] }),
}));

beforeEach(() => jest.clearAllMocks());
function openDrivers(){fireEvent.click(screen.getByRole('button',{name:'Водители'}));fireEvent.click(screen.getByRole('button',{name:'Получатели'}));}
function chooseDriver(name:string,amount:string){fireEvent.click(screen.getByRole('checkbox',{name:new RegExp(name)}));fireEvent.change(screen.getByRole('spinbutton',{name:`Сумма для ${name}`}),{target:{value:amount}});}
function choosePeriod(){fireEvent.click(screen.getByRole('button',{name:'Периоды выплаты'}));fireEvent.click(screen.getAllByRole('checkbox')[0]);fireEvent.click(screen.getByRole('button',{name:'Готово'}));}
test('office and drivers retain the same main fields without an inline driver list',()=>{
  render(<EmployeeAdvanceModal onClose={jest.fn()} onSaved={jest.fn()}/>);
  expect(screen.getByRole('combobox',{name:'Отдел'})).toBeInTheDocument();
  expect(screen.getByRole('combobox',{name:'Получатели'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Водители'}));
  expect(screen.getByRole('combobox',{name:'Отдел'})).toBeInTheDocument();
  expect(screen.getByRole('option',{name:'Все школы'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Получатели'})).toBeInTheDocument();
  expect(screen.getByRole('spinbutton',{name:'Сумма, сом'})).toHaveAttribute('readonly');
  expect(screen.queryByText('Водитель А')).not.toBeInTheDocument();
});
test('driver selection adds up individual amounts in the main amount field',()=>{
  render(<EmployeeAdvanceModal onClose={jest.fn()} onSaved={jest.fn()}/>);
  openDrivers();chooseDriver('Водитель А','500');chooseDriver('Водитель Б','700');
  fireEvent.click(screen.getByRole('button',{name:'Готово'}));
  expect(screen.queryByRole('dialog',{name:'Выбор водителей и сумм'})).not.toBeInTheDocument();
  expect(screen.getByRole('spinbutton',{name:'Сумма, сом'})).toHaveValue(1200);
  expect(screen.getByText('Выбрано водителей: 2')).toBeInTheDocument();
  expect(screen.queryByText('Водитель А')).not.toBeInTheDocument();
});
test('select all and a common amount prepare individual driver advances',async()=>{
  const saved=jest.fn();render(<EmployeeAdvanceModal onClose={jest.fn()} onSaved={saved}/>);
  openDrivers();
  fireEvent.click(screen.getByRole('checkbox',{name:'Выбрать всех в списке'}));
  fireEvent.change(screen.getByRole('spinbutton',{name:'Сумма для всех выбранных'}),{target:{value:'500'}});
  fireEvent.click(screen.getByRole('button',{name:'Применить выбранным'}));
  fireEvent.click(screen.getByRole('button',{name:'Готово'}));
  choosePeriod();fireEvent.click(screen.getByRole('button',{name:'Выдать аванс'}));
  await waitFor(()=>expect(saved).toHaveBeenCalledTimes(1));
  expect(createV2DriverAdvance).toHaveBeenCalledTimes(2);
  expect(createV2DriverAdvance).toHaveBeenCalledWith(expect.objectContaining({driverId:'driver-a',transferId:'transfer-a',schoolKey:'TIS',amount:500}));
  expect(createV2DriverAdvance).toHaveBeenCalledWith(expect.objectContaining({driverId:'driver-b',amount:500}));
  expect(createEmployeeAdvance).not.toHaveBeenCalled();
});
test('cancel discards edits and switching office does not discard driver selections',()=>{
  render(<EmployeeAdvanceModal onClose={jest.fn()} onSaved={jest.fn()}/>);
  openDrivers();chooseDriver('Водитель А','500');fireEvent.click(screen.getByRole('button',{name:'Готово'}));
  fireEvent.click(screen.getByRole('button',{name:'Получатели'}));
  fireEvent.change(screen.getByRole('spinbutton',{name:'Сумма для Водитель А'}),{target:{value:'900'}});
  fireEvent.click(screen.getByRole('button',{name:'Отмена'}));
  expect(screen.getByRole('spinbutton',{name:'Сумма, сом'})).toHaveValue(500);
  fireEvent.click(screen.getByRole('button',{name:'Офис'}));fireEvent.click(screen.getByRole('button',{name:'Водители'}));
  expect(screen.getByRole('spinbutton',{name:'Сумма, сом'})).toHaveValue(500);
});
test('department field filters schools in the driver picker',()=>{
  render(<EmployeeAdvanceModal onClose={jest.fn()} onSaved={jest.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Водители'}));
  fireEvent.change(screen.getByRole('combobox',{name:'Отдел'}),{target:{value:'TIS'}});
  fireEvent.click(screen.getByRole('button',{name:'Получатели'}));
  expect(screen.getByRole('checkbox',{name:/Водитель А/})).toBeInTheDocument();
  expect(screen.queryByRole('checkbox',{name:/Водитель Б/})).not.toBeInTheDocument();
});
test('office salary saves the employee and department',async()=>{
  render(<EmployeeAdvanceModal sessionToken="session" onClose={jest.fn()} onSaved={jest.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Зарплата'}));
  fireEvent.change(screen.getByRole('combobox',{name:'Отдел'}),{target:{value:'service'}});
  fireEvent.change(screen.getByRole('combobox',{name:'Получатели'}),{target:{value:'office'}});
  choosePeriod();fireEvent.change(screen.getByRole('spinbutton',{name:'Сумма, сом'}),{target:{value:'2000'}});
  fireEvent.click(screen.getByRole('button',{name:'Выплатить зарплату'}));
  await waitFor(()=>expect(createExpense).toHaveBeenCalledWith(expect.objectContaining({category:'office',employeeId:'office',departmentKey:'service',unitPrice:2000}),'session'));
  expect(createEmployeeAdvance).not.toHaveBeenCalled();
});
test('driver salary saves its chosen transfer and recipient',async()=>{
  render(<EmployeeAdvanceModal sessionToken="session" onClose={jest.fn()} onSaved={jest.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Зарплата'}));
  openDrivers();chooseDriver('Водитель А','1000');fireEvent.click(screen.getByRole('button',{name:'Готово'}));choosePeriod();
  fireEvent.click(screen.getByRole('button',{name:'Выплатить зарплату'}));
  await waitFor(()=>expect(createExpense).toHaveBeenCalledWith(expect.objectContaining({category:'school',driverId:'driver-a',transferId:'transfer-a',schoolKey:'TIS',unitPrice:1000}),'session'));
  expect(createV2DriverAdvance).not.toHaveBeenCalled();
});
test('retry skips driver advances successfully saved before a failure',async()=>{
  (createV2DriverAdvance as jest.Mock).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Ошибка сети')).mockResolvedValueOnce(undefined);
  const close=jest.fn();render(<EmployeeAdvanceModal onClose={close} onSaved={jest.fn()}/>);
  openDrivers();chooseDriver('Водитель А','500');chooseDriver('Водитель Б','700');fireEvent.click(screen.getByRole('button',{name:'Готово'}));
  choosePeriod();fireEvent.click(screen.getByRole('button',{name:'Выдать аванс'}));
  await screen.findByText(/Сохранено 1 из 2/);
  expect(screen.getByRole('button',{name:'Получатели'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Повторить оставшиеся выплаты'}));
  await waitFor(()=>expect(close).toHaveBeenCalledTimes(1));
  expect(createV2DriverAdvance).toHaveBeenCalledTimes(3);
  expect(createV2DriverAdvance).toHaveBeenLastCalledWith(expect.objectContaining({driverId:'driver-b',amount:700}));
});

test('office salary across two periods uses explicit amounts and does not duplicate the total',async()=>{
  const close=jest.fn();render(<EmployeeAdvanceModal sessionToken="session" onClose={close} onSaved={jest.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Зарплата'}));
  fireEvent.change(screen.getByRole('combobox',{name:'Отдел'}),{target:{value:'service'}});
  fireEvent.change(screen.getByRole('combobox',{name:'Получатели'}),{target:{value:'office'}});
  fireEvent.click(screen.getByRole('button',{name:'Периоды выплаты'}));
  const checkboxes=screen.getAllByRole('checkbox');
  fireEvent.click(checkboxes[0]);fireEvent.click(checkboxes[1]);
  const amounts=screen.getAllByRole('spinbutton');
  fireEvent.change(amounts[0],{target:{value:'700'}});fireEvent.change(amounts[1],{target:{value:'300'}});
  fireEvent.click(screen.getByRole('button',{name:'Готово'}));
  expect(screen.getByRole('spinbutton',{name:'Сумма, сом'})).toHaveValue(1000);
  fireEvent.click(screen.getByRole('button',{name:'Выплатить зарплату'}));
  await waitFor(()=>expect(close).toHaveBeenCalledTimes(1));
  expect(createExpense).toHaveBeenCalledTimes(2);
  const calls=(createExpense as jest.Mock).mock.calls.map(call=>call[0]);
  expect(calls.map(row=>row.unitPrice)).toEqual([700,300]);
  expect(calls[0].salaryPeriodKey).toMatch(/-09-1$/);expect(calls[1].salaryPeriodKey).toMatch(/-09-2$/);
});
test('driver advances persist each selected half-month with its own amount',async()=>{
  render(<EmployeeAdvanceModal onClose={jest.fn()} onSaved={jest.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Водители'}));
  fireEvent.click(screen.getByRole('button',{name:'Периоды выплаты'}));
  const checkboxes=screen.getAllByRole('checkbox');fireEvent.click(checkboxes[0]);fireEvent.click(checkboxes[1]);
  fireEvent.click(screen.getByRole('button',{name:'Готово'}));
  fireEvent.click(screen.getByRole('button',{name:'Получатели'}));
  fireEvent.click(screen.getByRole('checkbox',{name:/Водитель А/}));
  const amounts=screen.getAllByRole('spinbutton',{name:/Сумма для Водитель А за/});
  fireEvent.change(amounts[0],{target:{value:'400'}});fireEvent.change(amounts[1],{target:{value:'600'}});
  fireEvent.click(screen.getByRole('button',{name:'Готово'}));
  expect(screen.getByRole('spinbutton',{name:'Сумма, сом'})).toHaveValue(1000);
  fireEvent.click(screen.getByRole('button',{name:'Выдать аванс'}));
  await waitFor(()=>expect(createV2DriverAdvance).toHaveBeenCalledTimes(2));
  expect(createV2DriverAdvance).toHaveBeenCalledWith(expect.objectContaining({amount:400,salaryPeriodKey:expect.stringMatching(/-09-1$/)}));
  expect(createV2DriverAdvance).toHaveBeenCalledWith(expect.objectContaining({amount:600,salaryPeriodKey:expect.stringMatching(/-09-2$/)}));
});
