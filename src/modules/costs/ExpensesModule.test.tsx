import { updateExpense } from '../../services/expenseService';
import { loadExpenseRows } from './expenseRows';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import ExpensesModule, { ExpenseModal } from './ExpensesModule';
jest.mock('../../services/expenseService',()=>({createExpense:jest.fn(async expense=>({...expense,id:'saved'})),updateExpense:jest.fn(),deleteExpense:jest.fn()}));
jest.mock('./expenseRows',()=>({loadExpenseRows:jest.fn(),periodBounds:()=>({first:'2026-10-01',last:'2026-10-31'})}));
jest.mock('../../hooks/useCrmQueries',()=>({useEmployees:()=>({data:[{id:'employee-1',fullName:'Сотрудник',status:'active',role:'cashier'}]}),useDriversTable:()=>({data:[]})}));
jest.mock('../../services/supabase',()=>({supabase:{from:jest.fn(()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})}),upsert:async()=>({error:null})}))}}));
const props={allowPersonalCategory:true,onClose:jest.fn(),onSaved:jest.fn(),sessionToken:'session'};
test.each(['school','office'] as const)('new %s expense changes to salary inside the same card',category=>{
  render(<ExpenseModal {...props} initialCategory={category}/>);
  fireEvent.change(screen.getByRole('combobox',{name:'Подкатегория'}), {target:{value:'ЗП'}});
  expect(screen.getByRole('button',{name:'Зарплата'})).toHaveAttribute('aria-pressed','true');
  expect(screen.getByRole('button',{name:category==='school'?'Водители':'Офис'})).toHaveAttribute('aria-pressed','true');
  expect(screen.getByRole('button',{name:'Периоды выплаты'})).toBeInTheDocument();
});

test('salary rows separate payroll from ordinary expenses and open the scoped salary view',async()=>{
  (loadExpenseRows as jest.Mock).mockResolvedValue([
    {id:'office-cost',category:'office',subcategory:'Аренда',amount:100,paymentMethod:'cashless'},
    {id:'office-salary',category:'office',subcategory:'ЗП',amount:700,paymentMethod:'cashless'},
    {id:'office-advance',category:'office',subcategory:'Аванс',source:'advance',amount:300,paymentMethod:'cashless'},
    {id:'school-cost',category:'school',subcategory:'Прочее',amount:120,paymentMethod:'cashless'},
    {id:'school-salary',category:'school',subcategory:'ЗП',amount:500,paymentMethod:'cashless'},
  ]);
  const open=jest.fn();
  render(<ExpensesModule selectedCategory={null} onCategoryChange={jest.fn()} selectedSubcategory="ALL" onSubcategoryChange={jest.fn()} userRole="admin" sessionToken="session" onOpenSalary={open}/>);
  const officeSalary=await screen.findByRole('row',{name:/ЗП офис/});
  expect(within(officeSalary).getAllByText(/1\s000/).length).toBeGreaterThan(0);
  const officeCosts=screen.getByRole('row',{name:/^Офис/});
  expect(within(officeCosts).getAllByText('100').length).toBeGreaterThan(0);
  fireEvent.click(within(officeSalary).getByRole('button'));
  expect(open).toHaveBeenCalledWith('office');
  fireEvent.click(within(screen.getByRole('row',{name:/ЗП школа/})).getByRole('button'));
  expect(open).toHaveBeenLastCalledWith('school');
});

const expenseRows = [
  {id:'office-cost',name:'Аренда офиса',category:'office',subcategory:'Аренда',amount:100,unitPrice:100,quantity:1,paymentMethod:'cashless',expenseDate:'2026-10-12',createdAt:'2026-10-12',source:'manual',comment:''},
  {id:'school-cost',name:'Бумага для школы',category:'school',subcategory:'Прочее',amount:50,unitPrice:50,quantity:1,paymentMethod:'cash',expenseDate:'2026-10-11',createdAt:'2026-10-11',source:'manual',comment:''},
  {id:'private',name:'Секретный личный расход',category:'personal',subcategory:'Прочее',amount:900,unitPrice:900,quantity:1,paymentMethod:'cash',expenseDate:'2026-10-11',createdAt:'2026-10-11',source:'manual',comment:''},
];

test.each(['admin','gen_director','cashier'] as const)('all expenses table respects %s access and opens editing', async userRole=>{
  (loadExpenseRows as jest.Mock).mockResolvedValue(expenseRows);
  render(<ExpensesModule selectedCategory={null} onCategoryChange={jest.fn()} selectedSubcategory="ALL" onSubcategoryChange={jest.fn()} userRole={userRole}/>);
  await screen.findByRole('row',{name:/^Офис/});
  await act(async () => { fireEvent.click(screen.getByRole('button',{name:'Все расходы'})); });
  expect(screen.getByText('Аренда офиса')).toBeInTheDocument();
  expect(screen.getByText('Бумага для школы')).toBeInTheDocument();
  expect(Boolean(screen.queryByText('Секретный личный расход'))).toBe(userRole !== 'cashier');
  fireEvent.click(screen.getByText('Сумма'));
  const dataRows = screen.getAllByRole('row').filter(row => row.querySelector('td'));
  expect(dataRows[0]).toHaveTextContent('Бумага для школы');
  fireEvent.click(screen.getByRole('button',{name:'Редактировать Аренда офиса'}));
  expect(screen.getByRole('dialog',{name:'Редактирование расхода'})).toBeInTheDocument();
  expect(screen.getByDisplayValue('Аренда офиса')).toBeInTheDocument();
});

test('category table includes only expenses in that category', async()=>{
  (loadExpenseRows as jest.Mock).mockResolvedValue(expenseRows);
  render(<ExpensesModule selectedCategory="office" onCategoryChange={jest.fn()} selectedSubcategory="ALL" onSubcategoryChange={jest.fn()} userRole="admin"/>);
  await screen.findByRole('row',{name:/^Аренда/});
  await act(async () => { fireEvent.click(screen.getByRole('button',{name:'Все расходы категории'})); });
  expect(screen.getByText('Аренда офиса')).toBeInTheDocument();
  expect(screen.queryByText('Бумага для школы')).not.toBeInTheDocument();
  expect(screen.queryByText('Секретный личный расход')).not.toBeInTheDocument();
});

test('editing an existing salary uses the same card and retains identity',()=>{
  const record = {...expenseRows[0],source:'manual' as const,category:'office' as const,paymentMethod:'cashless' as const,subcategory:'ЗП',employeeId:'employee-1',departmentKey:'finance',salaryPeriodKey:'2026-10-1'};
  render(<ExpenseModal {...props} initialCategory="office" expense={record}/>);
  expect(screen.getByRole('button',{name:'Зарплата'})).toHaveAttribute('aria-pressed','true');
  expect(screen.getByRole('combobox',{name:'Получатели'})).toHaveValue('employee-1');
});

test('edits a price in place, saves and recalculates the total', async()=>{
  (loadExpenseRows as jest.Mock).mockResolvedValue(expenseRows);
  (updateExpense as jest.Mock).mockImplementation(async (id, payload)=>({...payload,id,amount:payload.unitPrice*payload.quantity}));
  render(<ExpensesModule selectedCategory={null} onCategoryChange={jest.fn()} selectedSubcategory="ALL" onSubcategoryChange={jest.fn()} userRole="admin" sessionToken="session"/>);
  await screen.findByRole('row',{name:/^Офис/});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Все расходы'}));});
  const row=screen.getByText('Аренда офиса').closest('tr')!;
  const cells=within(row).getAllByRole('cell');
  const headerCells=screen.getAllByRole('row')[0].querySelectorAll('th');
  const priceIndex=Array.from(headerCells).findIndex(cell=>cell.textContent?.includes('Цена'));
  fireEvent.click(cells[priceIndex]);
  const input=within(row).getByRole('textbox');
  fireEvent.change(input,{target:{value:'250'}});
  await act(async()=>{fireEvent.keyDown(input,{key:'Enter'});});
  expect(updateExpense).toHaveBeenLastCalledWith('office-cost',expect.objectContaining({unitPrice:250,quantity:1,amount:250}),'session');
  expect(within(screen.getByText('Аренда офиса').closest('tr')!).getAllByText('250')).toHaveLength(2);
  expect(document.querySelector('.expenses-panel-title')).toBeNull();
  expect(document.querySelector('.dt-toolbar .expenses-table-heading')).toHaveTextContent('Все расходы');
});

test('finance columns can be shown and hidden with saved settings', async()=>{
  (loadExpenseRows as jest.Mock).mockResolvedValue(expenseRows);
  render(<ExpensesModule selectedCategory={null} onCategoryChange={jest.fn()} selectedSubcategory="ALL" onSubcategoryChange={jest.fn()} userRole="admin"/>);
  await screen.findByRole('row',{name:/^Офис/});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Все расходы'}));});
  expect(document.querySelector('thead')).not.toHaveTextContent('Отдел');
  fireEvent.click(screen.getByRole('button',{name:'Колонки'}));
  const department=screen.getByText('Отдел',{selector:'.dt-props-item-name'});
  await act(async()=>{fireEvent.click(department);});
  expect(document.querySelector('thead')).toHaveTextContent('Отдел');
  await act(async()=>{fireEvent.click(screen.getByText('Отдел',{selector:'.dt-props-item-name'}));});
  expect(document.querySelector('thead')).not.toHaveTextContent('Отдел');
  const {supabase}=jest.requireMock('../../services/supabase');
  expect(supabase.from).toHaveBeenCalledWith('column_settings');
});

test('advance amounts are editable in finance and saved to the payout source',async()=>{
  const advance={...expenseRows[0],id:'employee-advance-original',name:'Аванс — Зульфия',subcategory:'Аванс',source:'advance'};
  (loadExpenseRows as jest.Mock).mockResolvedValue([advance]);
  const maybeSingle=jest.fn(async()=>({data:{id:'original'},error:null}));
  const eq=jest.fn(()=>({select:()=>({maybeSingle})}));
  const update=jest.fn(()=>({eq}));
  const {supabase}=jest.requireMock('../../services/supabase');
  supabase.from.mockImplementation(()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})}),update}));
  render(<ExpensesModule selectedCategory={null} onCategoryChange={jest.fn()} selectedSubcategory="ALL" onSubcategoryChange={jest.fn()} userRole="admin"/>);
  await screen.findByRole('row',{name:/^ЗП офис/});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Все расходы'}));});
  const row=screen.getByText('Аванс — Зульфия').closest('tr')!;
  const headers=Array.from(document.querySelectorAll('thead th'));
  const index=headers.findIndex(cell=>cell.textContent==='Сумма');
  fireEvent.click(within(row).getAllByRole('cell')[index]);
  const input=within(row).getByRole('textbox');
  fireEvent.change(input,{target:{value:'70000'}});
  await act(async()=>{fireEvent.keyDown(input,{key:'Enter'});});
  expect(update).toHaveBeenCalledWith({amount:70000});
  expect(eq).toHaveBeenCalledWith('id','original');
});
