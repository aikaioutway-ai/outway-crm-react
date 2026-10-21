import AllRecordsButton from '../../core/dashboard/AllRecordsButton';
import { queryClient } from '../../services/queryClient';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ListTodo, Pencil, Trash2, Plus, RefreshCw, AlertCircle, CheckCheck, Clock, X, ChevronDown } from 'lucide-react';
import { AuthenticatedUser } from '../../services/employeeService';
import { useTaskMetadata, useTasks, useTaskSummary } from '../../services/taskService';
import TaskTeamOverview from './TaskTeamOverview';
import { canLeadTasks, CrmTask, canViewTeamTasks, isTaskOverdue, TASK_STATUS, TASK_DEPARTMENTS, TaskFilters, TaskTarget, taskDate } from './taskTypes';
import TaskComposer from './TaskComposer';
import TaskDetail from './TaskDetail';
import './TasksModule.css';
type TasksModuleProps = {user:AuthenticatedUser;context?:TaskTarget;onClearContext?:()=>void;onOpenTarget?:(target:TaskTarget)=>void};
const TASK_COLUMNS: {view:TaskFilters['view'];label:string;status?:TaskFilters['status']}[] = [
  {view:'mine',label:'Мои задачи'},
  {view:'created',label:'Поставленные мной'},
  {view:'watching',label:'Наблюдаю'},
  {view:'created',label:'Ждут моей проверки',status:'review'},
];
export default function TasksModule(props:TasksModuleProps) {
  const metadata=useTaskMetadata(props.user.sessionToken);
  const columns=TASK_COLUMNS;
  const showOverview=metadata.data?.canViewAll ?? canViewTeamTasks(props.user.role);
  const [overviewExpanded,setOverviewExpanded]=useState(false);
  const summary=useTaskSummary(props.user.sessionToken);
  const [quickFilter,setQuickFilter]=useState<{view:TaskFilters['view'];status:TaskFilters['status'];due:string}>();
  const [allTasksOpen,setAllTasksOpen]=useState(false);
  const allTasksDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(allTasksOpen && !allTasksDialog.current?.open)allTasksDialog.current?.showModal();},[allTasksOpen]);
  const [teamSelection,setTeamSelection]=useState<{department:string;assigneeId:string}|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(teamSelection && !dialog.current?.open)dialog.current?.showModal();},[teamSelection]);
  const cards=[
    {label:'Мои открытые',value:summary.data?.open,icon:ListTodo,color:'teal',view:'mine',status:'active',due:''},
    {label:'Нужно принять',value:summary.data?.new,icon:ArrowRight,color:'blue',view:'mine',status:'new',due:''},
    {label:'Просрочены',value:summary.data?.overdue,icon:AlertCircle,color:'red',view:'mine',status:'active',due:'overdue'},
    {label:'Срок в течение суток',value:summary.data?.dueSoon,icon:Clock,color:'amber',view:'mine',status:'active',due:'soon'},
    {label:'Ждут моей проверки',value:summary.data?.review,icon:CheckCheck,color:'violet',view:'created',status:'review',due:''},
  ] as const;
  return <section className="tasks-board-module"><header className="tasks-heading"><div className="tasks-heading-title"><span><ListTodo size={23}/></span><div><h1>Задачи</h1><p>Все списки задач в одном окне</p></div></div><AllRecordsButton onClick={()=>setAllTasksOpen(true)}/></header>
    {allTasksOpen && <dialog ref={allTasksDialog} className="tasks-dialog tasks-department-dialog" aria-label="Все задачи" onCancel={()=>setAllTasksOpen(false)}><header><h2>Все задачи</h2><button type="button" className="tasks-icon" aria-label="Закрыть все задачи" onClick={()=>setAllTasksOpen(false)}><X size={18}/></button></header><TaskColumn {...props} column={{view:showOverview?'all':'mine',label:'Все задачи'}} initialFilters={{status:'all'}}/></dialog>}
    <div className="tasks-kpis">{cards.map(card=><button key={card.label} type="button" className={`tasks-kpi ${card.color}`} onClick={()=>setQuickFilter({view:card.view,status:card.status,due:card.due})}><span><card.icon size={18}/>{card.label}</span><strong>{card.value ?? '—'}</strong></button>)}</div>
    {showOverview && <section className="tasks-module tasks-overview-column tasks-overview-wide" key="all"><header className="tasks-column-heading"><button type="button" className="tasks-overview-toggle" aria-expanded={overviewExpanded} aria-controls="tasks-team-statistics" onClick={()=>setOverviewExpanded(current=>!current)}><ChevronDown size={18} className={overviewExpanded?'':'is-collapsed'}/><h2>Все задачи</h2></button><button className="tasks-icon" aria-label="Обновить статистику" onClick={()=>void queryClient.invalidateQueries({queryKey:['tasks',props.user.sessionToken]})}><RefreshCw size={16}/></button></header><div id="tasks-team-statistics" hidden={!overviewExpanded}><TaskTeamOverview token={props.user.sessionToken} role={props.user.role} employees={metadata.data?.employees ?? []} onSelect={(department,assigneeId)=>setTeamSelection({department,assigneeId})}/></div></section>}
    <div className="tasks-personal-board tasks-personal-board-four" aria-label="Личные задачи">{columns.map(column=><TaskColumn key={column.label} {...props} column={column} quickFilter={quickFilter}/>)}</div>
    {teamSelection && <dialog ref={dialog} className="tasks-dialog tasks-department-dialog" onCancel={()=>setTeamSelection(null)} onClick={event=>{if(event.target===event.currentTarget)setTeamSelection(null);}}><header><h2>{metadata.data?.employees.find(employee=>employee.id===teamSelection.assigneeId)?.full_name ?? TASK_DEPARTMENTS[teamSelection.department]?.label}</h2><button className="tasks-icon" aria-label="Закрыть задачи отдела" onClick={()=>setTeamSelection(null)}><X size={18}/></button></header>{teamSelection.assigneeId ? <><button type="button" className="tasks-secondary tasks-team-back" onClick={()=>setTeamSelection({department:teamSelection.department,assigneeId:''})}>← Сотрудники отдела</button><div className="tasks-board tasks-department-list"><TaskColumn key={teamSelection.assigneeId} {...props} column={{view:'all',label:'Задачи за всё время'}} initialFilters={teamSelection}/></div></> : <TaskTeamOverview token={props.user.sessionToken} role={props.user.role} departmentKey={teamSelection.department} employees={metadata.data?.employees ?? []} onSelect={(department,assigneeId)=>setTeamSelection({department,assigneeId})}/>}</dialog>}
  </section>;
}

function TaskColumn({user,onOpenTarget,context,onClearContext,column,initialFilters,quickFilter}:TasksModuleProps & {column:typeof TASK_COLUMNS[number];initialFilters?:Partial<TaskFilters>;quickFilter?:{view:TaskFilters['view'];status:TaskFilters['status'];due:string}}) {
  const [editingTask,setEditingTask]=useState<CrmTask|null>(null);
  const [detailAction,setDetailAction]=useState('');
  const [filters,setFilters]=useState<TaskFilters>({view:column.view,status:column.status ?? (column.view==='mine'?'active':'all'),...initialFilters});
  const [page,setPage]=useState(0);const [creating,setCreating]=useState(false);const [selected,setSelected]=useState('');
  useEffect(()=>{if(context){setFilters(current=>({...current,schoolKey:context.type==='school'?context.id:'',entityType:context.type,entityId:context.id}));setPage(0);}},[context,user.role]);
  const metadata=useTaskMetadata(user.sessionToken);
  const tasks=useTasks(user.sessionToken,filters,page);
  const employees=metadata.data?.employees ?? [];
  const names=new Map(employees.map(e=>[e.id,e.full_name]));
  useEffect(()=>{if(!column.status && quickFilter?.view===column.view){setFilters(current=>({...current,status:quickFilter.status,due:quickFilter.due}));setPage(0);}},[quickFilter,column.view,column.status]);
  const change=(patch:Partial<TaskFilters>)=>{setFilters(current=>({...current,...patch}));setPage(0);};
  const renderTaskCard=(task:CrmTask)=><article key={task.id} className={`tasks-compact-card ${isTaskOverdue(task)?'tasks-card-overdue':''}`}>
        <div><span>Кто поставил</span><strong>{names.get(task.creator_id) ?? task.creator_id}</strong></div>
        <div><span>Кому</span><strong>{names.get(task.assignee_id) ?? task.assignee_id}</strong></div>
        <div><span>Что</span><button type="button" className="tasks-title-button" onClick={()=>{setDetailAction('');setSelected(task.id);}}>{task.priority==='urgent' && <span className="tasks-priority-dot" title="Срочная задача"/>}{task.title}<ArrowRight size={14}/></button></div>
        <div><span>Когда</span><strong className={isTaskOverdue(task)?'tasks-overdue':''}>{taskDate(task.due_at)}</strong></div>
        <div><span>Статус</span><span className={`tasks-status status-${task.status}`}>{TASK_STATUS[task.status]}</span></div>
        {(task.creator_id===user.id || canLeadTasks(user.role)) && <div className="tasks-row-actions"><button type="button" className="tasks-icon" aria-label={`Редактировать задачу ${task.title}`} title={['done','cancelled'].includes(task.status)?'Сначала откройте задачу повторно':'Редактировать'} disabled={['done','cancelled'].includes(task.status)} onClick={()=>setEditingTask(task)}><Pencil size={15}/></button><button type="button" className="tasks-icon tasks-delete-button" aria-label={`Удалить задачу ${task.title}`} title="Удалить задачу" onClick={()=>{setDetailAction('delete');setSelected(task.id);}}><Trash2 size={15}/></button></div>}
      </article>;
  const taskList = <div className="tasks-list-panel">{context && <div className="tasks-context" style={{padding:'12px 18px'}}><strong>Задачи: {context.label}</strong><button type="button" className="tasks-secondary" onClick={()=>{change({entityType:'',entityId:'',schoolKey:''});onClearContext?.();}}>Убрать привязку</button></div>}
      {(tasks.error || metadata.error) ? <div role="alert" className="tasks-error">{tasks.error?.message || metadata.error?.message}<button className="tasks-secondary" onClick={()=>{void tasks.refetch();void metadata.refetch();}}>Повторить</button></div> : tasks.isLoading ? <div className="tasks-empty">Загрузка задач…</div> : !tasks.data?.rows.length ? <div className="tasks-empty"><ListTodo size={36}/><h2>Задач пока нет</h2><p>{filters.view==='mine'?'Здесь появятся назначенные вам задачи. Можно поставить задачу себе или коллеге.':'По выбранным фильтрам ничего не найдено.'}</p><button type="button" className="tasks-secondary" onClick={()=>setCreating(true)}>Создать первую задачу</button></div> : <div className={column.view==='all'?'tasks-status-board':'tasks-card-list'}>{column.view==='all'?Object.entries(TASK_STATUS).map(([status,label])=><section className="tasks-status-column" key={status}><header><h3>{label}</h3><span>{tasks.data.rows.filter(task=>task.status===status).length}</span></header><div>{tasks.data.rows.filter(task=>task.status===status).map(renderTaskCard)}</div></section>):tasks.data.rows.map(renderTaskCard)}</div>}
      <footer className="tasks-pagination"><span>{tasks.data?.total ?? 0} задач · сначала ближайшие сроки</span><div><button type="button" className="tasks-secondary" disabled={page===0 || tasks.isFetching} onClick={()=>setPage(p=>p-1)}>Назад</button><span>{page+1} / {Math.max(1,Math.ceil((tasks.data?.total ?? 0)/50))}</span><button type="button" className="tasks-secondary" disabled={(page+1)*50>=(tasks.data?.total ?? 0) || tasks.isFetching} onClick={()=>setPage(p=>p+1)}>Далее</button></div></footer>
    </div>;
  return <section className="tasks-module">
    <header className="tasks-column-heading"><h2>{column.label}</h2><div><button type="button" className="tasks-icon" aria-label={`Поставить задачу: ${column.label}`} onClick={()=>setCreating(true)}><Plus size={16}/></button><button type="button" className="tasks-icon" aria-label={`Обновить: ${column.label}`} onClick={()=>{void queryClient.invalidateQueries({queryKey:['tasks',user.sessionToken]});}} disabled={tasks.isFetching}><RefreshCw size={16}/></button></div></header>
    {!column.status && quickFilter?.view===column.view && <button className="tasks-secondary" onClick={()=>change({status:column.view==='mine'?'active':'all',due:''})}>Сбросить фильтр дашборда</button>}
    {taskList}
    {editingTask && <TaskComposer token={user.sessionToken} task={editingTask} onClose={()=>setEditingTask(null)} onSaved={()=>setEditingTask(null)}/> }
    {creating && <TaskComposer token={user.sessionToken} onClose={()=>setCreating(false)}/>}
    {selected && <TaskDetail initialAction={detailAction} id={selected} user={user} employees={employees} onClose={()=>setSelected('')} onOpenTarget={onOpenTarget ? target=>{setSelected('');onOpenTarget(target);}:undefined}/>}
  </section>;
}
