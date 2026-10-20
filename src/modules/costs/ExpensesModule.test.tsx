import { loadExpenseRows } from './expenseRows';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ExpensesModule, { ExpenseModal } from './ExpensesModule';
jest.mock('../../services/expenseService',()=>({createExpense:jest.fn(async expense=>({...expense,id:'saved'})),updateExpense:jest.fn(),deleteExpense:jest.fn()}));
jest.mock('./expenseRows',()=>({loadExpenseRows:jest.fn(),periodBounds:()=>({first:'2026-10-01',last:'2026-10-31'})}));
jest.mock('./EmployeeAdvanceModal',()=>()=>null);
const props={allowPersonalCategory:true,onClose:jest.fn(),onSaved:jest.fn(),sessionToken:'session'};
test.each(['school','office'] as const)('new %s expense cannot issue salary',category=>{
  render(<ExpenseModal {...props} initialCategory={category}/>);
  expect(screen.queryByRole('option',{name:'ЗП'})).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox',{name:'Школа'})).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox',{name:'Отдел'})).not.toBeInTheDocument();
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
  expect(within(officeSalary).getAllByText(/1\s000 сом/).length).toBeGreaterThan(0);
  const officeCosts=screen.getByRole('row',{name:/^Офис/});
  expect(within(officeCosts).getAllByText('100 сом').length).toBeGreaterThan(0);
  fireEvent.click(within(officeSalary).getByRole('button'));
  expect(open).toHaveBeenCalledWith('office');
  fireEvent.click(within(screen.getByRole('row',{name:/ЗП школа/})).getByRole('button'));
  expect(open).toHaveBeenLastCalledWith('school');
});
