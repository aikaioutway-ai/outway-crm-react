import FilterableTable from '../../core/tables/FilterableTable';
import { AlertCircle, CheckCheck, CheckCircle2, ChevronRight, Clock, ListTodo, Users } from 'lucide-react';
import { useTaskStatistics } from '../../services/taskService';
import { ROLE_LABELS, TASK_DEPARTMENTS, TaskCounts, TaskEmployee, taskDepartment } from './taskTypes';
const empty = (): TaskCounts => ({ total: 0, open: 0, completed: 0, overdue: 0, review: 0 });
const add = (a: TaskCounts, b: TaskCounts): TaskCounts => ({ total:a.total+b.total, open:a.open+b.open, completed:a.completed+b.completed, overdue:a.overdue+b.overdue, review:a.review+b.review });
export default function TaskTeamOverview({ token, employees, onSelect, role, departmentKey }: { token?: string; role?: string; departmentKey?: string; employees: TaskEmployee[]; onSelect: (department: string, employee: string) => void }) {
  const stats = useTaskStatistics(token);
  const byEmployee = stats.data?.byEmployee ?? {};
  const groups = Object.entries(TASK_DEPARTMENTS).filter(([key])=>!role || ['admin','gen_director'].includes(role) || key===(role==='director'?'management':role==='senior_logist'?'logistics':role==='cashier'?'finance':'')).map(([key, department]) => {
    const people = employees.filter(person => taskDepartment(person.role) === key && byEmployee[person.id]).sort((a,b)=>a.full_name.localeCompare(b.full_name,'ru'));
    return { key, ...department, people, counts: people.reduce((sum,person)=>add(sum,byEmployee[person.id]),empty()) };
  }).filter(group=>group.people.length > 0 && (!departmentKey || group.key===departmentKey));
  const totals = groups.reduce((sum,group)=>add(sum,group.counts),empty());
  const metrics = [
    {key:'total',label:'Всего задач',icon:ListTodo},
    {key:'open',label:'Открытые',icon:Clock},
    {key:'completed',label:'Выполнено',icon:CheckCircle2},
    {key:'overdue',label:'Просрочено',icon:AlertCircle},
    {key:'review',label:'На проверке',icon:CheckCheck},
  ] as const;
  const cells = (counts: TaskCounts) => <>{metrics.map(metric=><td data-comment-column={metric.key} key={metric.key} className={`tasks-metric-cell metric-${metric.key}`}><span className={counts[metric.key] ? 'tasks-metric-value' : 'tasks-metric-zero'}>{counts[metric.key]}</span></td>)}</>;
  return <section className="tasks-team-panel" aria-label="Статистика задач по отделам">
    <header><div><Users size={20}/><h2>Все задачи</h2></div><span>Все доступные задачи · включая завершённые</span></header>
    {stats.error ? <div className="tasks-error" role="alert">{stats.error.message}<button className="tasks-secondary" onClick={()=>void stats.refetch()}>Повторить</button></div> : stats.isLoading ? <div className="tasks-empty">Загрузка статистики…</div> : <div className="tasks-table-scroll"><FilterableTable data-comment-table="tasks/TaskTeamOverview:0" className="tasks-team-table">
      <thead><tr><th scope="col"><div className="tasks-metric-heading"><span className="tasks-metric-icon"><Users size={19}/></span><div><strong>{departmentKey?groups.reduce((sum,group)=>sum+group.people.length,0):groups.length}</strong><small>{departmentKey?'Сотрудники':'Отделы / сотрудники'}</small></div></div></th>{metrics.map(metric=><th scope="col" key={metric.key} className={`metric-${metric.key}`}><div className="tasks-metric-heading"><span className="tasks-metric-icon"><metric.icon size={19}/></span><div><strong>{totals[metric.key]}</strong><small>{metric.label}</small></div></div></th>)}</tr></thead>
      <tbody>{departmentKey ? groups.flatMap(group=>group.people.map(person=><tr data-comment-row={person.id} key={person.id}><td><button type="button" className="tasks-title-button" onClick={()=>onSelect(group.key,person.id)}>{person.full_name}<ChevronRight size={14}/></button><small>{ROLE_LABELS[person.role]}</small></td>{cells(byEmployee[person.id])}</tr>)) : groups.map(group=><TaskDepartmentRow key={group.key} group={group} onSelect={onSelect} cells={cells}/>)}
      {groups.length === 0 && <tr><td colSpan={6}>Доступных задач пока нет</td></tr>}</tbody>
      <tfoot><tr><th>Итого</th>{cells(totals)}</tr></tfoot>
    </FilterableTable></div>}
  </section>;
}
function TaskDepartmentRow({group,onSelect,cells}: {group:{key:string;label:string;people:TaskEmployee[];counts:TaskCounts};onSelect:(department:string,employee:string)=>void;cells:(counts:TaskCounts)=>React.ReactNode}) {
  return <tr className="tasks-department-row"><td><button className="tasks-department-toggle" type="button" onClick={()=>onSelect(group.key,'')}><strong>{group.label}</strong><ChevronRight size={15}/></button></td>{cells(group.counts)}</tr>;
}
