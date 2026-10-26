import { ExpenseRecord } from './expenseTypes';
import { salaryExpensePeriods,currentSchoolYear } from './salaryExpensePeriods';
import { createExpense, deleteExpense, updateExpense } from '../../services/expenseService';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EmployeeAdvanceModal from './EmployeeAdvanceModal';
import { createV2DriverAdvance, deleteV2DriverAdvance } from '../../services/crmV2Service';
import { createEmployeeAdvance } from '../../services/employeeService';

jest.mock('../../services/expenseService', () => ({ createExpense: jest.fn().mockResolvedValue({id:'saved'}),updateExpense:jest.fn().mockImplementation(async(id,row)=>({...row,id})),deleteExpense:jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../services/crmV2Service', () => ({ createV2DriverAdvance: jest.fn().mockResolvedValue('driver-advance-id'), deleteV2DriverAdvance: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../services/employeeService', () => ({ createDefaultEmployeeDocuments:()=>[],createEmployeeAdvance: jest.fn().mockResolvedValue({id:'employee-advance-id'}), deleteEmployeeAdvance: jest.fn().mockResolvedValue(undefined) }));
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
  expect(screen.getByRole('button',{name:'Получатели'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Водители'}));
  expect(screen.getByRole('combobox',{name:'Школа'})).toBeInTheDocument();
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
  fireEvent.change(screen.getByRole('combobox',{name:'Школа'}),{target:{value:'TIS'}});
  fireEvent.click(screen.getByRole('button',{name:'Получатели'}));
  expect(screen.getByRole('checkbox',{name:/Водитель А/})).toBeInTheDocument();
  expect(screen.queryByRole('checkbox',{name:/Водитель Б/})).not.toBeInTheDocument();
});
test('office salary saves the employee and department',async()=>{
  render(<EmployeeAdvanceModal sessionToken="session" onClose={jest.fn()} onSaved={jest.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Зарплата'}));
  fireEvent.change(screen.getByRole('combobox',{name:'Отдел'}),{target:{value:'service'}});
  fireEvent.click(screen.getByRole('button',{name:'Получатели'}));fireEvent.click(screen.getByRole('option',{name:'Офисный сотрудник'}));
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
  expect(createV2DriverAdvance).toHaveBeenLastCalledWith(expect.objectContaining({driverId:'driver-a',amount:500}));
});

test('office salary across two periods uses explicit amounts and does not duplicate the total',async()=>{
  const close=jest.fn();render(<EmployeeAdvanceModal sessionToken="session" onClose={close} onSaved={jest.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Зарплата'}));
  fireEvent.change(screen.getByRole('combobox',{name:'Отдел'}),{target:{value:'service'}});
  fireEvent.click(screen.getByRole('button',{name:'Получатели'}));fireEvent.click(screen.getByRole('option',{name:'Офисный сотрудник'}));
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

test('background and Escape close the payment dialog but clicks inside do not',()=>{
  const close=jest.fn();const {container}=render(<EmployeeAdvanceModal onClose={close} onSaved={jest.fn()}/>);
  fireEvent.mouseDown(screen.getByRole('dialog',{name:'Новая выплата'}));expect(close).not.toHaveBeenCalled();
  fireEvent.mouseDown(container.querySelector('.expense-modal-overlay')!);expect(close).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(screen.getByRole('dialog',{name:'Новая выплата'}),{key:'Escape'});expect(close).toHaveBeenCalledTimes(2);
});

test('period backdrop closes only the period picker and keeps the payment draft',()=>{
  const close=jest.fn();const {container}=render(<EmployeeAdvanceModal onClose={close} onSaved={jest.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Периоды выплаты'}));
  fireEvent.mouseDown(screen.getByRole('dialog',{name:'Периоды выплаты'}));expect(screen.getByRole('dialog',{name:'Периоды выплаты'})).toBeInTheDocument();
  fireEvent.mouseDown(container.querySelector('.payment-picker-overlay')!);
  expect(screen.queryByRole('dialog',{name:'Периоды выплаты'})).not.toBeInTheDocument();
  expect(screen.getByRole('dialog',{name:'Новая выплата'})).toBeInTheDocument();expect(close).not.toHaveBeenCalled();
});

test('Escape closes only the topmost picker',()=>{
  const close=jest.fn();render(<EmployeeAdvanceModal onClose={close} onSaved={jest.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Периоды выплаты'}));
  fireEvent.keyDown(screen.getByRole('dialog',{name:'Периоды выплаты'}),{key:'Escape'});
  expect(close).not.toHaveBeenCalled();expect(screen.getByRole('dialog',{name:'Новая выплата'})).toBeInTheDocument();
});

test('editing salary uses payout fields and updates instead of issuing another payment',async()=>{
 const period=salaryExpensePeriods(currentSchoolYear())[0].key;
 const expense={id:'existing',name:'ЗП — Офисный сотрудник',category:'office',subcategory:'ЗП',source:'manual',employeeId:'office',departmentKey:'service',salaryPeriodKey:period,amount:2000,unitPrice:2000,quantity:1,expenseDate:'2026-10-14',paymentMethod:'cashless',comment:'',createdAt:''} as ExpenseRecord;
 const saved=jest.fn();
 render(<EmployeeAdvanceModal expense={expense} onClose={jest.fn()} onSaved={jest.fn()} onRecordSaved={saved}/>);
 expect(screen.getByRole('dialog',{name:'Редактирование выплаты'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Получатели'})).toHaveTextContent('Офисный сотрудник');
 fireEvent.change(screen.getByRole('spinbutton',{name:'Сумма, сом'}),{target:{value:'2500'}});
 fireEvent.click(screen.getByRole('button',{name:'Сохранить изменения'}));
 await waitFor(()=>expect(saved).toHaveBeenCalled());
 expect(updateExpense).toHaveBeenCalledWith('existing',expect.objectContaining({amount:2500,employeeId:'office',salaryPeriodKey:period}),undefined);
 expect(createExpense).not.toHaveBeenCalled();
});

jest.mock('../../services/advanceExpenseService',()=>({updateAdvanceExpense:jest.fn(async(row,next)=>({...row,...next}))}));
test('editing an advance keeps the payout identity and does not create another advance',async()=>{
 const expense={id:'employee-advance-original',name:'Аванс — Офисный сотрудник',category:'office',subcategory:'Аванс',source:'advance',employeeId:'office',departmentKey:'service',amount:70000,unitPrice:70000,quantity:1,expenseDate:'2026-10-14',paymentMethod:'cashless',comment:'',createdAt:''} as ExpenseRecord;
 const saved=jest.fn();
 render(<EmployeeAdvanceModal expense={expense} onClose={jest.fn()} onSaved={jest.fn()} onRecordSaved={saved}/>);
 expect(screen.getByRole('button',{name:'Получатели'})).toHaveTextContent('Офисный сотрудник');
 fireEvent.change(screen.getByRole('spinbutton',{name:'Сумма, сом'}),{target:{value:'75000'}});
 fireEvent.click(screen.getByRole('button',{name:'Сохранить изменения'}));
 await waitFor(()=>expect(saved).toHaveBeenCalled());
 const {updateAdvanceExpense}=jest.requireMock('../../services/advanceExpenseService');
 expect(updateAdvanceExpense).toHaveBeenCalledWith(expense,expect.objectContaining({id:expense.id,employeeId:'office',amount:75000,salaryPeriodKey:'2026-10-1'}));
 expect(createEmployeeAdvance).not.toHaveBeenCalled();
});

test('one card keeps payment details while switching between expense, salary and advance',()=>{
 render(<EmployeeAdvanceModal initialPaymentType="expense" initialCategory="office" onClose={jest.fn()} onSaved={jest.fn()}/>);
 const dialog=screen.getByRole('dialog');
 fireEvent.change(screen.getByRole('textbox',{name:'Наименование расхода'}),{target:{value:'Бумага'}});
 fireEvent.change(screen.getByRole('textbox',{name:'Комментарий'}),{target:{value:'Сохранить комментарий'}});
 fireEvent.change(screen.getByRole('textbox',{name:'№ платёжного поручения'}),{target:{value:'777'}});
 fireEvent.click(screen.getByRole('button',{name:'Зарплата'}));
 expect(screen.getByRole('dialog')).toBe(dialog);
 expect(screen.getByRole('button',{name:'Получатели'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Аванс'}));
 expect(screen.getByRole('dialog')).toBe(dialog);
 fireEvent.click(screen.getByRole('button',{name:'Расход'}));
 expect(screen.getByRole('textbox',{name:'Наименование расхода'})).toHaveValue('Бумага');
 expect(screen.getByRole('textbox',{name:'Комментарий'})).toHaveValue('Сохранить комментарий');
 expect(screen.getByRole('textbox',{name:'№ платёжного поручения'})).toHaveValue('777');
});

test('ordinary expense uses the common card and saves calculated quantity and amount',async()=>{
 const saved=jest.fn();
 render(<EmployeeAdvanceModal initialPaymentType="expense" initialCategory="office" onClose={jest.fn()} onSaved={jest.fn()} onRecordSaved={saved}/>);
 fireEvent.change(screen.getByRole('textbox',{name:'Наименование расхода'}),{target:{value:'Бумага'}});
 fireEvent.change(screen.getByRole('spinbutton',{name:'Цена, сом'}),{target:{value:'250'}});
 fireEvent.change(screen.getByRole('spinbutton',{name:'Количество'}),{target:{value:'3'}});
 fireEvent.click(screen.getByRole('button',{name:'Добавить расход'}));
 await waitFor(()=>expect(saved).toHaveBeenCalled());
 expect(createExpense).toHaveBeenCalledWith(expect.objectContaining({name:'Бумага',category:'office',unitPrice:250,quantity:3}),undefined);
 expect(createEmployeeAdvance).not.toHaveBeenCalled();
});

test('converting an ordinary expense to salary updates its category and subcategory',async()=>{
 const expense={id:'legacy-expense',name:'ЗП Офис',category:'office',subcategory:'Прочее',source:'manual',unitPrice:50000,quantity:1,amount:50000,expenseDate:'2026-10-15',paymentMethod:'cashless',comment:'',createdAt:''} as ExpenseRecord;
 (updateExpense as jest.Mock).mockImplementationOnce(async(id,next)=>{
   if(next.employeeId && (next.category!=='office' || next.subcategory!=='ЗП'))throw new Error('Проверьте обязательные поля расхода');
   return {...next,id};
 });
 const saved=jest.fn();render(<EmployeeAdvanceModal expense={expense} onClose={jest.fn()} onSaved={jest.fn()} onRecordSaved={saved}/>);
 fireEvent.click(screen.getByRole('button',{name:'Зарплата'}));
 fireEvent.change(screen.getByRole('combobox',{name:'Отдел'}),{target:{value:'service'}});
 fireEvent.click(screen.getByRole('button',{name:'Получатели'}));fireEvent.click(screen.getByRole('option',{name:'Офисный сотрудник'}));
 fireEvent.click(screen.getByRole('button',{name:'Сохранить изменения'}));
 await waitFor(()=>expect(saved).toHaveBeenCalled());
 expect(updateExpense).toHaveBeenCalledWith('legacy-expense',expect.objectContaining({category:'office',subcategory:'ЗП',employeeId:'office',salaryPeriodKey:'2026-10-1'}),undefined);
 expect(createExpense).not.toHaveBeenCalled();
});

test('legacy expense can switch to driver advance and exposes advance in subcategories',async()=>{
 const expense={id:'legacy-advance',name:'Аванс Водителям',category:'school',subcategory:'Прочее',source:'manual',amount:5000,unitPrice:5000,quantity:1,expenseDate:'2026-10-15',paymentMethod:'cashless',comment:'',createdAt:''} as ExpenseRecord;
 render(<EmployeeAdvanceModal expense={expense} onClose={jest.fn()} onSaved={jest.fn()}/>);
 expect(screen.getByRole('option',{name:'Аванс'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Аванс'})).toBeEnabled();
 fireEvent.change(screen.getByRole('combobox',{name:'Подкатегория'}),{target:{value:'Аванс'}});
 expect(screen.getByRole('button',{name:'Аванс'})).toHaveAttribute('aria-pressed','true');
 expect(screen.getByRole('button',{name:'Водители'})).toBeEnabled();
 fireEvent.click(screen.getByRole('button',{name:'Офис'}));
 expect(screen.getByRole('button',{name:'Получатели'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Водители'}));
 expect(screen.getByRole('button',{name:'Получатели'})).toBeInTheDocument();
});

test('reclassifying a manual expense as an office advance moves it to the employee without a duplicate',async()=>{
 const expense={id:'legacy',name:'Расход',category:'office',subcategory:'Прочее',source:'manual',amount:5000,unitPrice:5000,quantity:1,expenseDate:'2026-10-15',paymentMethod:'cashless',comment:'',createdAt:''} as ExpenseRecord;
 const saved=jest.fn();render(<EmployeeAdvanceModal expense={expense} onClose={jest.fn()} onSaved={saved}/>);
 fireEvent.click(screen.getByRole('button',{name:'Аванс'}));
 fireEvent.click(screen.getByRole('button',{name:'Получатели'}));fireEvent.click(screen.getByRole('option',{name:'Офисный сотрудник'}));
 fireEvent.click(screen.getByRole('button',{name:'Сохранить изменения'}));
 await waitFor(()=>expect(saved).toHaveBeenCalled());
 expect(createEmployeeAdvance).toHaveBeenCalledWith('office',5000,'2026-10-15','',expect.objectContaining({schoolKey:'OFFICE'}));
 expect(deleteExpense).toHaveBeenCalledWith('legacy',undefined);
 expect(updateExpense).not.toHaveBeenCalled();
});

test('reclassifying a manual expense as a driver advance links it to the driver',async()=>{
 const expense={id:'legacy-driver',name:'Аванс — Водитель А',category:'school',subcategory:'Аванс',source:'manual',amount:10000,unitPrice:10000,quantity:1,expenseDate:'2026-10-15',paymentMethod:'cashless',comment:'',createdAt:''} as ExpenseRecord;
 const saved=jest.fn();render(<EmployeeAdvanceModal expense={expense} onClose={jest.fn()} onSaved={saved}/>);
 expect(screen.getByRole('button',{name:'Аванс'})).toHaveAttribute('aria-pressed','true');
 fireEvent.click(screen.getByRole('button',{name:'Получатели'}));fireEvent.click(screen.getByRole('checkbox',{name:/Водитель А/}));fireEvent.change(screen.getByRole('spinbutton',{name:/Сумма для Водитель А за/}),{target:{value:'10000'}});fireEvent.click(screen.getByRole('button',{name:'Готово'}));
 fireEvent.click(screen.getByRole('button',{name:'Сохранить изменения'}));
 await waitFor(()=>expect(saved).toHaveBeenCalled());
 expect(createV2DriverAdvance).toHaveBeenCalledTimes(1);
 expect(createV2DriverAdvance).toHaveBeenCalledWith(expect.objectContaining({driverId:'driver-a',transferId:'transfer-a',schoolKey:'TIS',amount:10000}));
 expect(deleteExpense).toHaveBeenCalledWith('legacy-driver',undefined);
});

test('if the old expense cannot be removed, the new driver advance is rolled back',async()=>{
 (deleteExpense as jest.Mock).mockRejectedValueOnce(new Error('Нет доступа'));
 const expense={id:'legacy-driver',name:'Аванс — Водитель А',category:'school',subcategory:'Аванс',source:'manual',amount:10000,unitPrice:10000,quantity:1,expenseDate:'2026-10-15',paymentMethod:'cashless',comment:'',createdAt:''} as ExpenseRecord;
 const saved=jest.fn();render(<EmployeeAdvanceModal expense={expense} onClose={jest.fn()} onSaved={saved}/>);
 fireEvent.click(screen.getByRole('button',{name:'Получатели'}));fireEvent.click(screen.getByRole('checkbox',{name:/Водитель А/}));fireEvent.change(screen.getByRole('spinbutton',{name:/Сумма для Водитель А за/}),{target:{value:'10000'}});fireEvent.click(screen.getByRole('button',{name:'Готово'}));
 fireEvent.click(screen.getByRole('button',{name:'Сохранить изменения'}));
 expect(await screen.findByText('Нет доступа')).toBeInTheDocument();
 expect(deleteV2DriverAdvance).toHaveBeenCalledWith('driver-advance-id');
 expect(saved).not.toHaveBeenCalled();
});

test('salary includes a manually added driver with another current school',async()=>{
  const saved=jest.fn();
  render(<EmployeeAdvanceModal onClose={jest.fn()} onSaved={saved} initialPaymentType="salary" initialScope="drivers"/>);
  fireEvent.change(screen.getByRole('combobox',{name:'Школа'}),{target:{value:'TIS'}});
  fireEvent.click(screen.getByRole('button',{name:'Получатели'}));
  fireEvent.click(screen.getByRole('button',{name:'Добавить водителя к TIS · № 3'}));
  fireEvent.click(screen.getByRole('option',{name:'Водитель Б'}));
  fireEvent.change(screen.getByRole('spinbutton',{name:'Сумма для Водитель Б'}),{target:{value:'5000'}});
  fireEvent.click(screen.getByRole('button',{name:'Готово'}));
  choosePeriod();
  fireEvent.click(screen.getByRole('button',{name:'Выплатить зарплату'}));
  await waitFor(()=>expect(saved).toHaveBeenCalledTimes(1));
  expect(createExpense).toHaveBeenCalledWith(expect.objectContaining({temporaryDriver:true,driverId:'driver-b',transferId:'transfer-a',schoolKey:'TIS',unitPrice:5000}),undefined);
});

test('office recipient menu supports search and opens the existing inactive employee form',()=>{
  render(<EmployeeAdvanceModal onClose={jest.fn()} onSaved={jest.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Получатели'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Поиск сотрудника'}),{target:{value:'Офисный'}});
  expect(screen.getByRole('option',{name:'Офисный сотрудник'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Добавить нового'}));
  expect(screen.getByRole('dialog',{name:'Новый сотрудник'})).toBeInTheDocument();
  expect(screen.getByLabelText('Статус')).toHaveValue('inactive');
  expect(screen.getByLabelText('Статус')).toBeDisabled();
});
