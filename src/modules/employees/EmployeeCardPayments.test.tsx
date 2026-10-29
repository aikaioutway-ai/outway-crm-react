import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { fetchV2PayrollEntriesForPeriod } from '../../services/crmV2Service';
import { EmployeeCardModal } from './EmployeesPage';
import { fetchSpendingPayments } from '../../services/spendingService';
import type { Employee } from '../../types';
jest.mock('../../services/employeeSession',()=>({getEmployeeSessionRole:()=> 'admin'}));
jest.mock('../../services/spendingService',()=>({fetchSpendingPayments:jest.fn()}));
jest.mock('../../services/crmV2Service',()=>({fetchV2PayrollEntriesForPeriod:jest.fn().mockResolvedValue([])}));
jest.mock('../../services/employeeService',()=>({
  ...jest.requireActual('../../services/employeeService'),
  fetchEmployeeDocuments:jest.fn().mockResolvedValue([]),
  fetchEmployeeAdvances:jest.fn().mockResolvedValue([{id:'old',employeeId:'employee',amount:50,date:'2026-10-01',comment:'Старый аванс'}]),
}));
test('new advances update the card summary once, including after a save event',async()=>{
  const native={id:'new',employeeId:'employee',category:'OPEX',subcategory:'Авансы сотрудникам',date:'2026-10-02',salaryPeriodKey:'2026-10',amount:300,comment:'Аванс из новых расходов'};
  (fetchSpendingPayments as jest.Mock).mockResolvedValue([native,{...native,id:'copy',sourceRef:'v2_employee_advances:old',amount:50}]);
  const employee: Employee={id:'employee',fullName:'Сотрудник',role:'manager',status:'active',schoolKeys:[],login:'',position:'',phone1:'',createdAt:'',updatedAt:''};
  render(<EmployeeCardModal employee={employee} sessionToken="session" restrictedRole={null} onClose={()=>{}} onChanged={()=>{}} onDeleted={()=>{}} />);
  expect(await screen.findByText(/Авансы: 350/)).toBeInTheDocument();
  (fetchSpendingPayments as jest.Mock).mockResolvedValue([{...native,amount:500}]);
  fireEvent(window,new Event('outway-spending-updated'));
  await waitFor(()=>expect(screen.getByText(/Авансы: 550/)).toBeInTheDocument());
});

test('a payroll failure does not hide existing advances or show a false zero debt',async()=>{
  (fetchV2PayrollEntriesForPeriod as jest.Mock).mockRejectedValueOnce(new Error('Табель недоступен'));
  (fetchSpendingPayments as jest.Mock).mockResolvedValue([]);
  const employee: Employee={id:'employee',fullName:'Сотрудник',role:'manager',status:'active',schoolKeys:[],login:'',position:'',phone1:'',createdAt:'',updatedAt:''};
  render(<EmployeeCardModal employee={employee} sessionToken="session" restrictedRole={null} onClose={()=>{}} onChanged={()=>{}} onDeleted={()=>{}} />);
  expect(await screen.findByText(/Авансы: 50/)).toBeInTheDocument();
  expect(screen.getByText(/Наш долг: —/)).toBeInTheDocument();
  expect(screen.getByText('Табель недоступен')).toBeInTheDocument();
});
