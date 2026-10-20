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
