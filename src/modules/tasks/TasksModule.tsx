import { queryClient } from '../../services/queryClient';
import TaskTeamOverview from './TaskTeamOverview';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCheck, Clock, ListTodo, Pencil, Trash2, Plus, RefreshCw, Search, X } from 'lucide-react';
import { AuthenticatedUser } from '../../services/employeeService';
import { useTaskMetadata, useTasks, useTaskSummary } from '../../services/taskService';
import { SCHOOL_TABS } from '../families/constants';
import { canLeadTasks, CrmTask, canViewTeamTasks, isTaskOverdue, ROLE_LABELS, TASK_STATUS, TARGET_LABELS, TaskFilters, TaskTarget, TASK_DEPARTMENTS, taskDate } from './taskTypes';
import TaskComposer from './TaskComposer';
import TaskDetail from './TaskDetail';
import './TasksModule.css';
export default function TasksModule({user,onOpenTarget,context,onClearContext}:{user:AuthenticatedUser;context?:TaskTarget;onClearContext?:()=>void;onOpenTarget?:(target:TaskTarget)=>void}) {
  const teamDialog = useRef<HTMLDivElement>(null);
  const [teamSelection, setTeamSelection] = useState<{department:string;assigneeId:string}|null>(null);
  const [editingTask,setEditingTask]=useState<CrmTask|null>(null);
  const [detailAction,setDetailAction]=useState('');
  const [filters,setFilters]=useState<TaskFilters>({view:'mine',status:'active'});
  const [search,setSearch]=useState('');const [debounced,setDebounced]=useState('');
  const [page,setPage]=useState(0);const [creating,setCreating]=useState(false);const [selected,setSelected]=useState('');
  useEffect(()=>{if(context){setFilters(current=>({...current,view:canViewTeamTasks(user.role)?'all':'mine',schoolKey:context.type==='school'?context.id:'',entityType:context.type,entityId:context.id}));setPage(0);}},[context,user.role]);
  const metadata=useTaskMetadata(user.sessionToken);
  const summary=useTaskSummary(user.sessionToken);
  const tasks=useTasks(user.sessionToken,{...filters,search:debounced},page);
  const employees=metadata.data?.employees ?? [];
  const names=new Map(employees.map(e=>[e.id,e.full_name]));
  useEffect(()=>{const timer=setTimeout(()=>{setDebounced(search);setPage(0);},300);return()=>clearTimeout(timer);},[search]);
  const change=(patch:Partial<TaskFilters>)=>{setFilters(current=>({...current,...patch}));setPage(0);};
  const cards=[{label:'Мои открытые',value:summary.data?.open,icon:<ListTodo size={18}/>,color:'teal',patch:{view:'mine',status:'active',due:''}},
    {label:'Нужно принять',value:summary.data?.new,icon:<ArrowRight size={18}/>,color:'blue',patch:{view:'mine',status:'new',due:''}},
    {label:'Просрочены',value:summary.data?.overdue,icon:<AlertCircle size={18}/>,color:'red',patch:{view:'mine',status:'active',due:'overdue'}},
    {label:'Срок в течение суток',value:summary.data?.dueSoon,icon:<Clock size={18}/>,color:'amber',patch:{view:'mine',status:'active',due:'soon'}},
    {label:'Ждут моей проверки',value:summary.data?.review,icon:<CheckCheck size={18}/>,color:'violet',patch:{view:'created',status:'review',due:''}}];
  useEffect(()=>{if(teamSelection && filters.view==='all'){const previous=document.activeElement as HTMLElement|null;teamDialog.current?.focus();return()=>previous?.focus();}},[filters.view,teamSelection]);
  const taskList = <div className="tasks-list-panel">{context && <div className="tasks-context" style={{padding:'12px 18px'}}><strong>Задачи: {context.label}</strong><button type="button" className="tasks-secondary" onClick={()=>{change({entityType:'',entityId:'',schoolKey:''});onClearContext?.();}}>Убрать привязку</button></div>}
      <div className="tasks-filters"><label className="tasks-search"><Search size={16}/><input aria-label="Поиск задач" placeholder="Найти задачу…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
        <label><span>Статус</span><select value={filters.status} onChange={e=>change({status:e.target.value as TaskFilters['status'],due:''})}><option value="active">Все открытые</option>{Object.entries(TASK_STATUS).map(([key,label])=><option key={key} value={key}>{label}</option>)}<option value="all">Все статусы</option></select></label>
        <label><span>Школа</span><select value={filters.schoolKey ?? ''} onChange={e=>change({schoolKey:e.target.value})}><option value="">Все школы</option>{SCHOOL_TABS.filter(s=>s.key!=='ALL').map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
        <label><span>Срок</span><select value={filters.due ?? ''} onChange={e=>change({due:e.target.value,status:'active'})}><option value="">Любой срок</option><option value="overdue">Просроченные</option><option value="soon">В течение суток</option></select></label>
        <label><span>Приоритет</span><select value={filters.priority ?? ''} onChange={e=>change({priority:e.target.value})}><option value="">Любой приоритет</option><option value="urgent">Срочные</option></select></label>
        {filters.view!=='mine' && <label><span>Ответственный</span><select value={filters.assigneeId ?? ''} onChange={e=>change({assigneeId:e.target.value})}><option value="">Все сотрудники</option>{employees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}</select></label>}
        <label><span>Отдел</span><select value={filters.department ?? ''} onChange={e=>change({department:e.target.value})}><option value="">Все отделы</option><option value="logistics">Логистика</option><option value="management">Менеджеры</option><option value="finance">Финансы</option><option value="leadership">Руководство</option></select></label>
      </div>
      {(tasks.error || metadata.error) ? <div role="alert" className="tasks-error">{tasks.error?.message || metadata.error?.message}<button className="tasks-secondary" onClick={()=>{void tasks.refetch();void metadata.refetch();}}>Повторить</button></div> : tasks.isLoading ? <div className="tasks-empty">Загрузка задач…</div> : !tasks.data?.rows.length ? <div className="tasks-empty"><ListTodo size={36}/><h2>Задач пока нет</h2><p>{filters.view==='mine'?'Здесь появятся назначенные вам задачи. Можно поставить задачу себе или коллеге.':'По выбранным фильтрам ничего не найдено.'}</p><button type="button" className="tasks-secondary" onClick={()=>setCreating(true)}>Создать первую задачу</button></div> : <div className="tasks-table-scroll"><table className="tasks-table"><thead><tr><th>Задача и привязка</th><th>Ответственный</th><th>Срок</th><th>Статус</th><th>Наблюдатель</th><th>Постановщик</th><th>Действия</th></tr></thead><tbody>{tasks.data.rows.map(task=><tr key={task.id} className={isTaskOverdue(task)?'tasks-row-overdue':''}><td><button type="button" className="tasks-title-button" onClick={()=>{setDetailAction('');setSelected(task.id);}}>{task.priority==='urgent' && <span className="tasks-priority-dot" title="Срочная задача"/>}{task.title}<ArrowRight size={14}/></button><div className="tasks-row-context">{TARGET_LABELS[task.target.type]}{task.target.type!=='general' && ` · ${task.target.label}`}</div></td><td><strong>{names.get(task.assignee_id) ?? task.assignee_id}</strong><small>{ROLE_LABELS[employees.find(e=>e.id===task.assignee_id)?.role ?? '']}</small></td><td><span className={isTaskOverdue(task)?'tasks-overdue':''}>{taskDate(task.due_at)}</span>{isTaskOverdue(task) && <small className="tasks-overdue">Просрочена</small>}</td><td><span className={`tasks-status status-${task.status}`}>{TASK_STATUS[task.status]}</span></td><td>{task.observer_id ? names.get(task.observer_id) ?? task.observer_id : '—'}</td><td>{names.get(task.creator_id) ?? task.creator_id}</td><td>{(task.creator_id===user.id || canLeadTasks(user.role)) && <div className="tasks-row-actions"><button type="button" className="tasks-icon" aria-label={`Редактировать задачу ${task.title}`} title={['done','cancelled'].includes(task.status)?'Сначала откройте задачу повторно':'Редактировать'} disabled={['done','cancelled'].includes(task.status)} onClick={()=>setEditingTask(task)}><Pencil size={15}/></button><button type="button" className="tasks-icon tasks-delete-button" aria-label={`Удалить задачу ${task.title}`} title="Удалить задачу" onClick={()=>{setDetailAction('delete');setSelected(task.id);}}><Trash2 size={15}/></button></div>}</td></tr>)}</tbody></table></div>}
      <footer className="tasks-pagination"><span>{tasks.data?.total ?? 0} задач · сначала ближайшие сроки</span><div><button type="button" className="tasks-secondary" disabled={page===0 || tasks.isFetching} onClick={()=>setPage(p=>p-1)}>Назад</button><span>{page+1} / {Math.max(1,Math.ceil((tasks.data?.total ?? 0)/50))}</span><button type="button" className="tasks-secondary" disabled={(page+1)*50>=(tasks.data?.total ?? 0) || tasks.isFetching} onClick={()=>setPage(p=>p+1)}>Далее</button></div></footer>
    </div>;
  return <section className="tasks-module">
    <header className="tasks-heading"><div className="tasks-heading-title"><span><ListTodo size={23}/></span><div><h1>Задачи</h1><p>Договорённости, ответственные и сроки — в одном месте</p></div></div><button type="button" className="tasks-primary" onClick={()=>setCreating(true)}><Plus size={17}/>Поставить задачу</button></header>
    <div className="tasks-kpis">{cards.map(card=><button key={card.label} type="button" className={`tasks-kpi ${card.color}`} onClick={()=>change(card.patch as Partial<TaskFilters>)}><span>{card.icon}{card.label}</span><strong>{card.value ?? '—'}</strong></button>)}</div>

    <div className="tasks-list-panel"><div className="tasks-toolbar"><div className="tasks-tabs" role="tablist" aria-label="Чьи задачи">{[{key:'mine',label:'Мои задачи'},{key:'created',label:'Поставленные мной'},{key:'watching',label:'Наблюдаю'},...((metadata.data?.canViewAll ?? canViewTeamTasks(user.role))?[{key:'all',label:'Все задачи'}]:[])].map(tab=><button type="button" key={tab.key} role="tab" aria-selected={filters.view===tab.key} onClick={()=>{setTeamSelection(null);change({view:tab.key as TaskFilters['view'],status:tab.key==='mine'?'active':'all',due:'',priority:'',department:'',assigneeId:''});}}>{tab.label}</button>)}</div><button type="button" className="tasks-icon" title="Обновить задачи" aria-label="Обновить задачи" onClick={()=>{void queryClient.invalidateQueries({queryKey:['tasks',user.sessionToken]});}} disabled={tasks.isFetching}><RefreshCw size={16}/></button></div></div>
    {filters.view === 'all' ? <TaskTeamOverview token={user.sessionToken} employees={employees} onSelect={(department,assigneeId)=>{setTeamSelection({department,assigneeId});setSearch('');change({view:'all',status:'all',due:'',priority:'',schoolKey:'',entityType:'',entityId:'',department,assigneeId});}} /> : taskList}
    {filters.view === 'all' && teamSelection && <div className="tasks-overlay" onMouseDown={event=>{if(event.target===event.currentTarget){setTeamSelection(null);setSearch('');change({department:'',assigneeId:'',status:'all',due:''});}}}>
      <div ref={teamDialog} className="tasks-dialog tasks-team-dialog" role="dialog" aria-modal="true" aria-label={teamSelection.assigneeId ? `Задачи сотрудника ${names.get(teamSelection.assigneeId) ?? ''}` : `Задачи отдела ${TASK_DEPARTMENTS[teamSelection.department]?.label ?? ''}`} tabIndex={-1} onKeyDown={event=>{
        if(selected || creating || editingTask)return;
        if(event.key==='Escape'){event.stopPropagation();setTeamSelection(null);setSearch('');change({department:'',assigneeId:'',status:'all',due:''});}
        if(event.key==='Tab' && teamDialog.current){const nodes=Array.from(teamDialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)'));const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey && (document.activeElement===first || document.activeElement===teamDialog.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}}
      }}>
        <header className="tasks-team-dialog-head"><div><h2>{teamSelection ? teamSelection.assigneeId ? names.get(teamSelection.assigneeId) : TASK_DEPARTMENTS[teamSelection.department]?.label : 'Все задачи'}</h2><p>{teamSelection ? 'Список задач за всё время' : 'Отделы, сотрудники и результаты работы'}</p></div><button type="button" className="tasks-icon" aria-label="Закрыть все задачи" onClick={()=>{setTeamSelection(null);setSearch('');change({department:'',assigneeId:'',status:'all',due:''});}}><X size={18}/></button></header>
        {taskList}
      </div>
    </div>}

    {editingTask && <TaskComposer token={user.sessionToken} task={editingTask} onClose={()=>setEditingTask(null)} onSaved={()=>setEditingTask(null)}/> }
    {creating && <TaskComposer token={user.sessionToken} onClose={()=>setCreating(false)}/>}
    {selected && <TaskDetail initialAction={detailAction} id={selected} user={user} employees={employees} onClose={()=>setSelected('')} onOpenTarget={onOpenTarget ? target=>{setSelected('');onOpenTarget(target);}:undefined}/>}
  </section>;
}
