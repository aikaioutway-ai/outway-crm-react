jest.mock('../../services/spendingService',()=>({fetchSpendingPayments:jest.fn().mockResolvedValue([])}));
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

test('shows new cashier salary and advance but excludes copied finance rows',async()=>{
  const spending = jest.requireMock('../../services/spendingService');
  spending.fetchSpendingPayments.mockResolvedValueOnce([
    {id:'new-salary',employeeId:'employee',subcategory:'Зарплата офиса',date:'2026-10-22',amount:200,comment:'Новая зарплата из расходов'},
    {id:'new-advance',employeeId:'employee',subcategory:'Авансы сотрудникам',date:'2026-10-21',amount:100,comment:'Новый аванс из расходов'},
    {id:'copy',employeeId:'employee',sourceRef:'v2_expenses:salary',amount:20000,date:'2026-10-20',comment:'Дубль копии'},
    {id:'another',employeeId:'another',amount:999,date:'2026-10-23',comment:'Не этому сотруднику'},
  ]);
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><EmployeePaymentHistory employeeId="employee" sessionToken="session" advances={[]}/></QueryClientProvider>);
  expect(await screen.findByText('Новая зарплата из расходов')).toBeInTheDocument();
  expect(screen.getByText('Новый аванс из расходов')).toBeInTheDocument();
  expect(screen.queryByText('Дубль копии')).not.toBeInTheDocument();
  expect(screen.queryByText('Не этому сотруднику')).not.toBeInTheDocument();
});
