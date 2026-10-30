jest.mock('../../services/spendingService',()=>({fetchSpendingPayments:jest.fn().mockResolvedValue({rows:[],replacedRefs:new Set()})}));
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EmployeePaymentHistory from './EmployeePaymentHistory';
jest.mock('../../services/expenseService',()=>({fetchSalaryExpenses:jest.fn().mockResolvedValue([
  {id:'salary',employeeId:'employee',amount:20000,expenseDate:'2026-10-20',salaryPeriodKey:'2026-10-1',source:'salary',comment:'Зарплата за первую половину'},
  {id:'other',employeeId:'another',amount:90000,expenseDate:'2026-10-20',source:'salary',comment:'Чужая выплата'},
])}));
test('shows salary and advances with dates and periods only for this employee',async()=>{
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><EmployeePaymentHistory employeeId="employee" sessionToken="session" advances={[{id:'advance',employeeId:'employee',amount:1000,date:'2026-10-15',salaryPeriodKey:'2026-10-1',comment:'Аванс за первую половину'} as any]}/></QueryClientProvider>);
  expect(await screen.findByText('Зарплата за первую половину')).toBeInTheDocument();
  expect(screen.getByText('Аванс за первую половину')).toBeInTheDocument();
  expect(screen.queryByText('Чужая выплата')).not.toBeInTheDocument();
  expect(screen.getByRole('columnheader',{name:'Когда'})).toBeInTheDocument();
  expect(screen.getByRole('columnheader',{name:'Сколько'})).toBeInTheDocument();
  expect(screen.getAllByText(/октябрь.*1–15/)).toHaveLength(2);
});

test('shows new cashier payments and shows an edited finance copy instead of the old record',async()=>{
  const spending = jest.requireMock('../../services/spendingService');
  spending.fetchSpendingPayments.mockResolvedValueOnce({rows:[
    {id:'new-salary',employeeId:'employee',subcategory:'Зарплата офиса',date:'2026-10-22',amount:200,comment:'Новая зарплата из расходов'},
    {id:'new-advance',employeeId:'employee',subcategory:'Авансы сотрудникам',date:'2026-10-21',amount:100,comment:'Новый аванс из расходов'},
    {id:'copy',employeeId:'employee',subcategory:'Зарплата офиса',sourceRef:'v2_expenses:salary',amount:25000,date:'2026-10-20',comment:'Исправленная копия'},
    {id:'another',employeeId:'another',amount:999,date:'2026-10-23',comment:'Не этому сотруднику'},
  ],replacedRefs:new Set(['v2_expenses:salary','v2_employee_advances:deleted'])});
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><EmployeePaymentHistory employeeId="employee" sessionToken="session" advances={[{id:'deleted',employeeId:'employee',amount:700,date:'2026-10-10',comment:'Удалён в расходах'} as any]}/></QueryClientProvider>);
  expect(await screen.findByText('Новая зарплата из расходов')).toBeInTheDocument();
  expect(screen.getByText('Новый аванс из расходов')).toBeInTheDocument();
  expect(screen.getByText('Исправленная копия')).toBeInTheDocument();
  expect(screen.queryByText('Зарплата за первую половину')).not.toBeInTheDocument();
  expect(screen.queryByText('Удалён в расходах')).not.toBeInTheDocument();
  expect(screen.queryByText('Не этому сотруднику')).not.toBeInTheDocument();
});
