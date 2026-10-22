jest.mock('../../services/supabase',()=>({supabase:{from:jest.fn(()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})}))}}));
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SalaryExpensesView from './SalaryExpensesView';
jest.mock('../../services/expenseService',()=>({fetchSalaryExpenses:jest.fn(async()=>[{id:'salary',name:'ЗП — Кассир',category:'office',departmentKey:'finance',salaryPeriodKey:'2026-10-1',amount:2000,expenseDate:'2026-10-10',paymentMethod:'cash'}])}));
jest.mock('./expenseRows',()=>({loadExpenseRows:jest.fn(async()=>[{id:'advance',name:'Аванс — Кассир',category:'office',departmentKey:'finance',source:'advance',amount:500,expenseDate:'2026-10-10',paymentMethod:'cash'}])}));
jest.mock('./salaryExpensePeriods',()=>({currentSchoolYear:()=>2026,salaryExpensePeriods:()=>[{key:'2026-10-1',label:'Октябрь 2026 · 1–15'}]}));
test('office department opens its salary and advances together', async()=>{
  render(<SalaryExpensesView sessionToken="session"/>);
  await waitFor(()=>expect(screen.getAllByText(/2\s?500/).length).toBeGreaterThan(0));
  expect(screen.queryByText('Отдел финансов')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Офис'));
  fireEvent.click(screen.getByText('Отдел финансов'));
  expect(await screen.findByText('ЗП — Кассир')).toBeInTheDocument();
  expect(screen.getByText('Аванс — Кассир')).toBeInTheDocument();
});

test('office scope starts with departments, while school scope hides office and schools 2.0',async()=>{
  const {unmount}=render(<SalaryExpensesView sessionToken="session" scope="office"/>);
  await waitFor(()=>expect(screen.getAllByText(/2\s?500/).length).toBeGreaterThan(0));
  expect(screen.getByText('Отдел финансов')).toBeInTheDocument();
  expect(screen.queryByText('TIS')).not.toBeInTheDocument();
  unmount();render(<SalaryExpensesView sessionToken="session" scope="school"/>);
  await screen.findByText('TIS');
  expect(screen.queryByText('Офис')).not.toBeInTheDocument();
  expect(screen.queryByText('BJ')).not.toBeInTheDocument();
  expect(screen.queryByText('LA_P')).not.toBeInTheDocument();
  expect(screen.queryByText('ING_W')).not.toBeInTheDocument();
});

test.each(['office','school'] as const)('all expense table is available at the root of %s payroll',async scope=>{
  render(<SalaryExpensesView sessionToken="session" scope={scope}/>);
  await waitFor(()=>expect(screen.queryByText('Данные не загружены')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button',{name:'Все расходы'}));
  expect(await screen.findByRole('button',{name:'Скачать таблицу в Excel'})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Колонки'})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'К сводке'})).toBeInTheDocument();
  if(scope==='office')expect(await screen.findByText('Аванс — Кассир')).toBeInTheDocument();
  else expect(screen.queryByText('Аванс — Кассир')).not.toBeInTheDocument();
});
