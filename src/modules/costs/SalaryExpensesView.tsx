import { EMPLOYEE_DEPARTMENTS } from '../employees/employeeDepartments';
import { Banknote, CheckCircle2, ChevronRight, RefreshCw, School, WalletCards } from 'lucide-react';
import { DashboardGrid, DashboardSearch, DashboardTopPanel, OverviewColumn, SchoolAvatar } from '../../core/dashboard/DashboardUI';
import ManagerPeriodBar from '../families/ManagerPeriodBar';
import './ExpensesModule.css';
import { useEffect, useMemo, useState } from 'react';
import { deleteExpense, updateExpense, fetchSalaryExpenses } from '../../services/expenseService';
import { ALL_PERIODS, SCHOOL_TABS, isSchoolVisible } from '../families/constants';
import { ExpenseRecord } from './expenseTypes';
import { loadExpenseRows } from './expenseRows';
import { currentSchoolYear, salaryExpensePeriods } from './salaryExpensePeriods';
import { ExpenseModal, ExpensesTable } from './ExpensesModule';
import { deleteAdvanceExpense, updateAdvanceExpenseCell } from '../../services/advanceExpenseService';
import { Table2, ArrowLeft } from 'lucide-react';
import { money } from '../../utils/pricing';

export type SalaryScope = 'all' | 'school' | 'office';
export default function SalaryExpensesView({ sessionToken, scope='all', columnsOpen, onColumnsOpenChange }: { sessionToken?: string; scope?:SalaryScope; columnsOpen?:boolean; onColumnsOpenChange?:(open:boolean)=>void }) {
  const [tableOpen,setTableOpen]=useState(false);
  const [localColumns,setLocalColumns]=useState(false);
  const [editing,setEditing]=useState<ExpenseRecord|null>(null);
  const [deleting,setDeleting]=useState<string|null>(null);
  const propertiesOpen=columnsOpen ?? localColumns;
  const changeProperties=onColumnsOpenChange ?? setLocalColumns;
  useEffect(()=>{if(propertiesOpen)setTableOpen(true);},[propertiesOpen]);
  const [year] = useState(currentSchoolYear);
  const [search, setSearch] = useState('');
  const [half, setHalf] = useState<'ALL' | '1' | '2'>('ALL');
  const [period, setPeriod] = useState(() => { const now = new Date(); return ALL_PERIODS.find(item => item.month === now.getMonth() + 1 && item.year === now.getFullYear())?.key ?? 'ALL'; });
  const [sort, setSort] = useState('school');
  const [ascending, setAscending] = useState(true);
  const [school, setSchool] = useState<string | null>(scope==='office'?'OFFICE':null);
  const [department,setDepartment]=useState<string|null>(null);
  const [rows, setRows] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const periods = useMemo(() => salaryExpensePeriods(year), [year]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    const months = Array.from({ length: 9 }, (_, i) => ({ month: (i + 8) % 12 + 1, year: i < 4 ? year : year + 1 }));
    Promise.all([
      fetchSalaryExpenses(sessionToken),
      loadExpenseRows({ first: `${year}-09-01`, last: `${year + 1}-05-31` }, months, sessionToken),
    ]).then(([salaries, expenses]) => {
      if (active) setRows([...salaries.map(row=>({...row,source:'manual' as const,unitPrice:row.unitPrice ?? row.amount,quantity:row.quantity ?? 1})), ...expenses.filter(row => row.source === 'advance' && (row.category === 'school' || row.category === 'office'))]);
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить выплаты'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [year, sessionToken, refresh]);
  const filtered = rows.filter(row => {
    if(scope!=='all' && row.category!==scope)return false;
    if(row.category==='school' && row.schoolKey && !isSchoolVisible(row.schoolKey))return false;
    const key = row.salaryPeriodKey ?? `${row.expenseDate.slice(0, 7)}-${Number(row.expenseDate.slice(8, 10)) <= 15 ? 1 : 2}`;
    const month = ALL_PERIODS.find(item => item.key === period);
    return periods.some(item => item.key === key) && (!month || key.startsWith(`${month.year}-${String(month.month).padStart(2, '0')}-`)) && (half === 'ALL' || key.endsWith(`-${half}`));
  });
  const schools = [...SCHOOL_TABS.filter(item => item.key !== 'ALL').map(item => ({ key: item.key, label: item.label, logo: item.logo })), ...(scope==='school'?[]:[{key:'OFFICE',label:'Офис',logo:undefined}]), { key: 'UNASSIGNED', label: 'Без однозначной школы', logo: undefined }];
  const departments=[...EMPLOYEE_DEPARTMENTS.map(item=>({key:`OFFICE:${item.key}`,label:item.label,logo:undefined})),{key:'OFFICE:UNASSIGNED',label:'Без отдела',logo:undefined}];
  const schoolRows = (key: string) => filtered.filter(row => key==='OFFICE'?row.category==='office':key.startsWith('OFFICE:')?row.category==='office' && (row.departmentKey||'UNASSIGNED')===key.slice(7):row.category==='school' && (row.schoolKey||'UNASSIGNED')===key);
  const showOverview=!school || (school==='OFFICE' && !department);
  const overviewItems=school==='OFFICE'?departments:schools;
  const total = (list: ExpenseRecord[], advances = false) => list.filter(row => advances ? row.source === 'advance' : row.source !== 'advance').reduce((sum, row) => sum + row.amount, 0);
  const selectedRows = department?schoolRows(department):school?schoolRows(school):filtered;
  const sortedSchools = overviewItems.filter(item => (!['UNASSIGNED', 'OFFICE:UNASSIGNED'].includes(item.key) || schoolRows(item.key).length > 0) && item.label.toLowerCase().includes(search.toLowerCase())).map(item => {
    const list = schoolRows(item.key); const salary = total(list); const advance = total(list, true);
    return { ...item, salary, advance, total: salary + advance };
  }).sort((a, b) => {
    const difference = sort === 'school' ? a.label.localeCompare(b.label, 'ru', { numeric: true }) : a[sort as 'salary' | 'advance' | 'total'] - b[sort as 'salary' | 'advance' | 'total'];
    return ascending ? difference : -difference;
  });
  const handleSort = (key: string) => { setSort(key); setAscending(key === sort ? !ascending : key === 'school'); };
  const availablePeriods = ALL_PERIODS.filter(item => item.key !== 'deposit' && ((item.year === year && item.month >= 9) || (item.year === year + 1 && item.month <= 5)));
  const dataReady = !loading && !error;
  const saved = (expense:ExpenseRecord) => {setRows(current=>current.map(row=>row.id===expense.id ? {...expense,source:expense.source ?? 'manual'} : row));setEditing(null);};
  const remove = async (expense:ExpenseRecord) => {
    if(!window.confirm(`Удалить выплату «${expense.name}» на сумму ${money(expense.amount)}?`))return;
    setDeleting(expense.id);
    try {if(expense.source==='advance')await deleteAdvanceExpense(expense);else await deleteExpense(expense.id,sessionToken);setRows(current=>current.filter(row=>row.id!==expense.id));}
    catch(reason){alert(reason instanceof Error?reason.message:'Не удалось удалить выплату');}finally{setDeleting(null);}
  };
  const saveCell = async (row:ExpenseRecord,key:string,value:string) => {
    try {
      if(row.source==='advance'){saved(await updateAdvanceExpenseCell(row,key,value));return true;}
      const next={...row,[key]:['amount','unitPrice','quantity'].includes(key)?Number(value):value};
      if(key==='amount')next.unitPrice=next.amount/next.quantity;
      next.amount=next.unitPrice*next.quantity;
      if(!next.name.trim() || !Number.isFinite(next.amount) || next.amount<=0 || next.quantity<=0)throw new Error('Проверьте наименование, сумму и количество');
      saved({...await updateExpense(row.id,next,sessionToken),source:'manual'});return true;
    }catch(reason){alert(reason instanceof Error?reason.message:'Не удалось сохранить выплату');return false;}
  };
  const tableTitle=department?departments.find(item=>item.key===department)?.label:school?schools.find(item=>item.key===school)?.label:scope==='school'?'ЗП школа':'Все выплаты';
  return <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 10 }}>
    <DashboardTopPanel>
      <button type="button" className="expenses-view-button" style={{marginBottom:10}} onClick={()=>{setTableOpen(value=>!value);setSearch('');}}>{tableOpen ? <ArrowLeft size={15}/> : <Table2 size={15}/ >}{tableOpen ? 'К сводке' : 'Все расходы'}</button>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {(department || (school && scope!=='office')) && <button type="button" className="expense-cancel" onClick={() => { if(department)setDepartment(null);else setSchool(null);setHalf('ALL');setSearch(''); }}>← {department?'Офис':'Школы и офис'}</button>}
        <div style={{ flex: 1, minWidth: 0, display: 'flex' }}><ManagerPeriodBar periodKey={period} onPeriodKeyChange={setPeriod} periods={availablePeriods} showAll={false} /></div>
        <DashboardSearch width={260} value={search} onChange={setSearch} placeholder={tableOpen || !showOverview?'Поиск выплаты...':school==='OFFICE'?'Поиск отдела...':'Поиск школы или офиса...'} />
        <button type="button" style={{ width: 34, height: 34, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} title="Обновить" aria-label="Обновить выплаты" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16} /></button>
      </div>
      {school && <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 10 }}>
        <strong>{department?departments.find(item=>item.key===department)?.label:schools.find(item=>item.key===school)?.label}</strong>
        {(['ALL', '1', '2'] as const).map(value => <button key={value} type="button" onClick={() => setHalf(value)} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', background: half === value ? 'var(--accent)' : 'var(--surface)', color: half === value ? '#fff' : 'var(--text)' }}>{value === 'ALL' ? 'Весь месяц' : value === '1' ? '1–15' : '16–конец месяца'}</button>)}
      </div>}
    </DashboardTopPanel>
    {error && <div role="alert" className="expense-form-error">{error === 'Неизвестное действие' ? 'Загрузка выплат пока недоступна.' : error}</div>}
    {showOverview && !tableOpen ? <DashboardGrid template="minmax(230px, 1.4fr) repeat(3, minmax(150px, 1fr))">
      <OverviewColumn first sortKey="school" label={school==='OFFICE'?'Отдел':scope==='school'?'Школа':'Школа / офис'} icon={<School size={17} color="#fff" />} value={String(sortedSchools.length)} color="#64748B" sortState={{ key: sort, dir: ascending ? 'asc' : 'desc' }} onSort={handleSort}>
        {sortedSchools.map((item, index) => <div key={item.key} data-school-row={item.key} onClick={() => { if(school==='OFFICE')setDepartment(item.key);else setSchool(item.key);setSearch(''); }} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', cursor: 'pointer', background: index % 2 ? 'var(--surface-2)' : undefined }}>
          <SchoolAvatar logo={item.logo} label={item.label} color="var(--accent)" size={26} radius={7} fontSize={11} /><span style={{ fontWeight: 650, fontSize: 14 }}>{item.label}</span><ChevronRight size={14} color="var(--text-2)" />
        </div>)}
      </OverviewColumn>
      {([
        { key: 'advance', label: 'Авансы', icon: <WalletCards size={17} color="#fff" />, color: '#B45309' },
        { key: 'salary', label: 'Зарплата', icon: <Banknote size={17} color="#fff" />, color: '#1D6FA4' },
        { key: 'total', label: 'Оплачено', icon: <CheckCircle2 size={17} color="#fff" />, color: '#15803D' },
      ] as const).map(column => <OverviewColumn key={column.key} sortKey={column.key} label={column.label} icon={column.icon} value={dataReady ? money(sortedSchools.reduce((sum, item) => sum + item[column.key], 0)) : '—'} color={column.color} sortState={{ key: sort, dir: ascending ? 'asc' : 'desc' }} onSort={handleSort}>
        {sortedSchools.map((item, index) => <div key={item.key} data-school-row={item.key} style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px', background: index % 2 ? 'var(--surface-2)' : undefined }}><span style={{ fontSize: 14, fontWeight: 700, color: item[column.key] > 0 ? column.color : 'var(--text)' }}>{dataReady ? money(item[column.key]) : '—'}</span></div>)}
      </OverviewColumn>)}
    </DashboardGrid> : <div className="expenses-panel finance-workspace" style={{overflow:'auto'}}><ExpensesTable rows={selectedRows.filter(row=>[row.name,row.comment,row.paymentOrderNumber].some(value=>value?.toLowerCase().includes(search.toLowerCase())))} showCategory={true} allowPersonal={false} onEdit={setEditing} onDelete={remove} deletingId={deleting} onCellSave={saveCell} columnsOpen={propertiesOpen} onColumnsOpenChange={changeProperties} settingsKey={`finance_salary_${scope}_${school || 'all'}`} toolbar={<div className="expenses-table-heading"><strong>{tableTitle}</strong><span className="expenses-record-count">{selectedRows.length} записей</span><button type="button" className="expenses-view-button" onClick={()=>changeProperties(!propertiesOpen)}>Колонки</button></div>}/></div>}
    {editing && <ExpenseModal initialCategory={editing.category} expense={editing} sessionToken={sessionToken} allowPersonalCategory={false} onClose={()=>setEditing(null)} onSaved={saved} onPaymentsSaved={()=>{setRefresh(value=>value+1);setEditing(null);}}/>}

  </div>;
}
