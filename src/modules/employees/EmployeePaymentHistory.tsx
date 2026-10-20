import { useQuery } from '@tanstack/react-query';
import { ExpenseRecord } from '../costs/expenseTypes';
import { RefreshCw } from 'lucide-react';
import { fetchSalaryExpenses } from '../../services/expenseService';
import { EmployeeAdvance } from '../../services/employeeService';
import { driverPaymentPeriodLabel } from '../drivers/driverPayments';
import { money } from '../../utils/pricing';
export default function EmployeePaymentHistory({employeeId,sessionToken,advances}:{employeeId?:string;sessionToken?:string;advances:EmployeeAdvance[]}){
  const query=useQuery<ExpenseRecord[]>({queryKey:['employeePaymentHistory',employeeId,sessionToken],queryFn:()=>fetchSalaryExpenses(sessionToken),enabled:Boolean(employeeId && sessionToken)});
  if(!employeeId)return <div className="employee-empty">Сначала сохраните сотрудника</div>;
  const salaries:ExpenseRecord[]=query.data??[];
  const rows=[...salaries.filter(row=>row.employeeId===employeeId && row.source!=='advance').map(row=>({id:row.id,date:row.expenseDate,amount:row.amount,kind:'Зарплата',period:row.salaryPeriodKey??'',comment:row.comment})),...advances.map(row=>({id:`advance-${row.id}`,date:row.date,amount:row.amount,kind:'Аванс',period:row.salaryPeriodKey || (row.periodYear && row.periodMonth?`${row.periodYear}-${String(row.periodMonth).padStart(2,'0')}`:''),comment:row.comment}))].sort((a,b)=>b.date.localeCompare(a.date));
  return <section className="employee-payment-history"><header><div><h3>История выплат</h3><p>Авансы и зарплата сотрудника</p></div><button type="button" className="tasks-icon" aria-label="Обновить выплаты сотрудника" onClick={()=>void query.refetch()}><RefreshCw size={16}/></button></header>{query.error?<div role="alert" className="employee-error">{query.error.message}</div>:query.isPending?<div className="employee-empty">Загрузка выплат…</div>:<div className="employee-finance-wrap"><table className="employee-finance-table"><thead><tr>{['Когда','Сколько','За какой период','Тип','Комментарий'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.date?new Date(`${row.date}T00:00:00`).toLocaleDateString('ru-RU'):'—'}</td><td>{money(row.amount)}</td><td>{driverPaymentPeriodLabel(row.period)}</td><td>{row.kind}</td><td>{row.comment || '—'}</td></tr>)}{!rows.length && <tr><td colSpan={5}>Выплат пока нет</td></tr>}</tbody></table></div>}</section>;
}
