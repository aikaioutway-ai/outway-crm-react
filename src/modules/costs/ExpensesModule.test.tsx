import { render, screen } from '@testing-library/react';
import { ExpenseModal } from './ExpensesModule';
jest.mock('../../services/expenseService',()=>({createExpense:jest.fn(async expense=>({...expense,id:'saved'})),updateExpense:jest.fn(),deleteExpense:jest.fn()}));
jest.mock('./expenseRows',()=>({loadExpenseRows:jest.fn(),periodBounds:jest.fn()}));
jest.mock('./EmployeeAdvanceModal',()=>()=>null);
const props={allowPersonalCategory:true,onClose:jest.fn(),onSaved:jest.fn(),sessionToken:'session'};
test.each(['school','office'] as const)('new %s expense cannot issue salary',category=>{
  render(<ExpenseModal {...props} initialCategory={category}/>);
  expect(screen.queryByRole('option',{name:'ЗП'})).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox',{name:'Школа'})).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox',{name:'Отдел'})).not.toBeInTheDocument();
});
