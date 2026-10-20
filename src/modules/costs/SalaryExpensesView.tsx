import { Banknote, CheckCircle2, ChevronRight, RefreshCw, School, WalletCards } from 'lucide-react';
import { DashboardGrid, DashboardSearch, DashboardTopPanel, OverviewColumn, SchoolAvatar } from '../../core/dashboard/DashboardUI';
import ManagerPeriodBar from '../families/ManagerPeriodBar';
import './ExpensesModule.css';
import { useEffect, useMemo, useState } from 'react';
import { fetchSalaryExpenses } from '../../services/expenseService';
import { ALL_PERIODS, SCHOOL_TABS } from '../families/constants';
import { ExpenseRecord } from './expenseTypes';
import { loadExpenseRows } from './expenseRows';
import { currentSchoolYear, salaryExpensePeriods } from './salaryExpensePeriods';
import { money } from '../../utils/pricing';

export default function SalaryExpensesView({ sessionToken }: { sessionToken?: string }) {
  const [year] = useState(currentSchoolYear);
  const [search, setSearch] = useState('');
  const [half, setHalf] = useState<'ALL' | '1' | '2'>('ALL');
  const [period, setPeriod] = useState(() => { const now = new Date(); return ALL_PERIODS.find(item => item.month === now.getMonth() + 1 && item.year === now.getFullYear())?.key ?? 'ALL'; });
  const [sort, setSort] = useState('school');
  const [ascending, setAscending] = useState(true);
  const [school, setSchool] = useState<string | null>(null);
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
      if (active) setRows([...salaries, ...expenses.filter(row => row.source === 'advance' && row.category === 'school' && row.recipientType === 'driver')]);
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить выплаты'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [year, sessionToken, refresh]);
  const filtered = rows.filter(row => {
    const key = row.salaryPeriodKey ?? `${row.expenseDate.slice(0, 7)}-${Number(row.expenseDate.slice(8, 10)) <= 15 ? 1 : 2}`;
    const month = ALL_PERIODS.find(item => item.key === period);
    return periods.some(item => item.key === key) && (!month || key.startsWith(`${month.year}-${String(month.month).padStart(2, '0')}-`)) && (half === 'ALL' || key.endsWith(`-${half}`));
  });
  const schools = [...SCHOOL_TABS.filter(item => item.key !== 'ALL').map(item => ({ key: item.key, label: item.label, logo: item.logo })), { key: 'UNASSIGNED', label: 'Без однозначной школы', logo: undefined }];
  const schoolRows = (key: string) => filtered.filter(row => (row.schoolKey || 'UNASSIGNED') === key);
  const total = (list: ExpenseRecord[], advances = false) => list.filter(row => advances ? row.source === 'advance' : row.source !== 'advance').reduce((sum, row) => sum + row.amount, 0);
  const selectedRows = school ? schoolRows(school) : [];
  const sortedSchools = schools.filter(item => (item.key !== 'UNASSIGNED' || schoolRows(item.key).length > 0) && item.label.toLowerCase().includes(search.toLowerCase())).map(item => {
    const list = schoolRows(item.key); const salary = total(list); const advance = total(list, true);
    return { ...item, salary, advance, total: salary + advance };
  }).sort((a, b) => {
    const difference = sort === 'school' ? a.label.localeCompare(b.label, 'ru', { numeric: true }) : a[sort as 'salary' | 'advance' | 'total'] - b[sort as 'salary' | 'advance' | 'total'];
    return ascending ? difference : -difference;
  });
  const handleSort = (key: string) => { setSort(key); setAscending(key === sort ? !ascending : key === 'school'); };
  const availablePeriods = ALL_PERIODS.filter(item => item.key !== 'deposit' && ((item.year === year && item.month >= 9) || (item.year === year + 1 && item.month <= 5)));
  const dataReady = !loading && !error;
  return <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 10 }}>
    <DashboardTopPanel>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {school && <button type="button" className="expense-cancel" onClick={() => { setSchool(null); setHalf('ALL'); setSearch(''); }}>← Все школы</button>}
        <div style={{ flex: 1, minWidth: 0, display: 'flex' }}><ManagerPeriodBar periodKey={period} onPeriodKeyChange={setPeriod} periods={availablePeriods} showAll={false} /></div>
        <DashboardSearch width={260} value={search} onChange={setSearch} placeholder={school ? 'Поиск выплаты...' : 'Поиск школы...'} />
        <button type="button" style={{ width: 34, height: 34, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} title="Обновить" aria-label="Обновить выплаты" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16} /></button>
      </div>
      {school && <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 10 }}>
        <strong>{schools.find(item => item.key === school)?.label}</strong>
        {(['ALL', '1', '2'] as const).map(value => <button key={value} type="button" onClick={() => setHalf(value)} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', background: half === value ? 'var(--accent)' : 'var(--surface)', color: half === value ? '#fff' : 'var(--text)' }}>{value === 'ALL' ? 'Весь месяц' : value === '1' ? '1–15' : '16–конец месяца'}</button>)}
      </div>}
    </DashboardTopPanel>
    {error && <div role="alert" className="expense-form-error">{error === 'Неизвестное действие' ? 'Загрузка выплат пока недоступна.' : error}</div>}
    {!school ? <DashboardGrid template="minmax(230px, 1.4fr) repeat(3, minmax(150px, 1fr))">
      <OverviewColumn first sortKey="school" label="Школа" icon={<School size={17} color="#fff" />} value={String(sortedSchools.length)} color="#64748B" sortState={{ key: sort, dir: ascending ? 'asc' : 'desc' }} onSort={handleSort}>
        {sortedSchools.map((item, index) => <div key={item.key} data-school-row={item.key} onClick={() => { setSchool(item.key); setSearch(''); }} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', cursor: 'pointer', background: index % 2 ? 'var(--surface-2)' : undefined }}>
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
    </DashboardGrid> : <div className="expenses-panel" style={{ overflow: 'auto' }}><div className="expenses-table-wrap"><table className="expenses-table">
      <thead><tr>{['Дата выплаты', 'Наименование', 'Период', 'Вид', 'Способ оплаты', '№ поручения', 'Сумма'].map(label => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{loading ? <tr><td colSpan={7}>Загрузка…</td></tr> : selectedRows.length === 0 ? <tr><td colSpan={7}>{error ? 'Данные не загружены' : 'За выбранный период выплат нет'}</td></tr> : selectedRows.filter(row => row.name.toLowerCase().includes(search.toLowerCase())).map(row => <tr key={row.id}><td>{row.expenseDate}</td><td>{row.name}</td><td>{periods.find(item => item.key === row.salaryPeriodKey)?.label ?? row.expenseDate}</td><td>{row.source === 'advance' ? 'Аванс' : 'ЗП'}</td><td>{row.paymentMethod === 'cash' ? 'Наличные' : 'АйКай Мбанк'}</td><td>{row.paymentOrderNumber || '—'}</td><td>{money(row.amount)}</td></tr>)}</tbody>
    </table></div></div>}
  </div>;
}
