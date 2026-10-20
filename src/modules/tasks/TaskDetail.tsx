import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Clock, MessageSquare, Pencil, Play, RotateCcw, Send, Trash2, X } from 'lucide-react';
import { useTaskDetail, mutateTask } from '../../services/taskService';
import { AuthenticatedUser } from '../../services/employeeService';
import { canLeadTasks, isTaskOpen, isTaskOverdue, TASK_ACTIONS, TASK_STATUS, TARGET_LABELS, TaskEmployee, TaskTarget, taskDate } from './taskTypes';
import TaskComposer from './TaskComposer';
export default function TaskDetail({id,user,employees,onClose,onOpenTarget,initialAction=''}:{id:string;user:AuthenticatedUser;employees:TaskEmployee[];onClose:()=>void;onOpenTarget?:(target:TaskTarget)=>void;initialAction?:string}) {
  const detail=useTaskDetail(user.sessionToken,id);
  const task=detail.data?.task;
  const [editing,setEditing]=useState(false);
  const [message,setMessage]=useState('');
  const [result,setResult]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [action,setAction]=useState(initialAction);
  const dialog=useRef<HTMLDivElement>(null);
  const names=new Map(employees.map(employee=>[employee.id,employee.full_name]));
  const editor=Boolean(task && (task.creator_id===user.id || canLeadTasks(user.role)));
  const mine=task?.assignee_id===user.id;
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.focus();return()=>previous?.focus();},[]);
  const taskId=task?.id, taskResult=task?.result;
  useEffect(()=>{if(taskId)setResult(taskResult ?? '');},[taskId,taskResult]); // keep a draft while polling unchanged results
  const run=async(operation:string)=>{
    if(!task || busy)return;
    if(['cancel','reopen','return','comment','delete'].includes(operation) && !message.trim()){setError('Введите комментарий: он сохранится в истории задачи.');return;}
    if(operation==='submit' && !result.trim()){setError('Опишите результат выполнения.');return;}
    setBusy(true);setError('');
    try {await mutateTask(user.sessionToken,operation,{version:task.version,comment:message,result},task.id);setMessage('');setAction('');if(operation==='delete')onClose();}
    catch(caught){setError(caught instanceof Error?caught.message:'Не удалось изменить задачу');void detail.refetch();}
    finally{setBusy(false);}
  };
  const close=()=>{if(!busy)onClose();};
  if(editing && task)return <TaskComposer token={user.sessionToken} task={task} onClose={()=>setEditing(false)} onSaved={()=>setEditing(false)}/>;
  return <div className="tasks-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)close();}} onKeyDown={event=>{if(event.key==='Escape')close();if(event.key==='Tab' && dialog.current){const elements=Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]'));const first=elements[0],last=elements[elements.length-1];if(event.shiftKey && (document.activeElement===first || document.activeElement===dialog.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}}}}>
    <div ref={dialog} tabIndex={-1} className="tasks-dialog tasks-detail" role="dialog" aria-modal="true" aria-label={task?.title ?? 'Карточка задачи'}>
      <header><div><small>КАРТОЧКА ЗАДАЧИ</small><h2>{task?.title ?? 'Загрузка задачи…'}</h2></div><button className="tasks-icon" onClick={close} disabled={busy} aria-label="Закрыть карточку задачи"><X size={18}/></button></header>
      {detail.isLoading ? <div className="tasks-empty">Загрузка…</div> : detail.error ? <div className="tasks-error" role="alert">{detail.error.message}<button onClick={()=>void detail.refetch()}>Повторить</button></div> : task ? <div className="tasks-detail-body">
        <div className="tasks-detail-badges"><span className={`tasks-status status-${task.status}`}>{TASK_STATUS[task.status]}</span>{task.priority==='urgent' && <span className="tasks-urgent">Срочная</span>}{isTaskOverdue(task) && <span className="tasks-overdue">Срок прошёл</span>}</div>
        <p className="tasks-description">{task.description || 'Описание не добавлено'}</p>
        <div className="tasks-detail-grid"><div><small>ОТВЕТСТВЕННЫЙ</small><strong>{names.get(task.assignee_id) ?? task.assignee_id}</strong></div><div><small>СРОК</small><strong className={isTaskOverdue(task)?'tasks-overdue':''}><Clock size={14}/>{taskDate(task.due_at)}</strong></div><div><small>ПОСТАНОВЩИК</small><strong>{names.get(task.creator_id) ?? task.creator_id}</strong></div><div><small>НАБЛЮДАТЕЛЬ</small><strong>{task.observer_id ? names.get(task.observer_id) ?? task.observer_id : 'Не назначен'}</strong></div><div><small>КОНТРОЛЬ</small><strong>{task.requires_review?'Проверка постановщиком':'Закрывает исполнитель'}</strong></div></div>
        <div className="tasks-context"><div><small>{TARGET_LABELS[task.target.type]}</small><strong>{task.target.label}</strong></div>{task.target.type!=='general' && onOpenTarget && <button type="button" className="tasks-secondary" onClick={()=>onOpenTarget(task.target)}>Открыть <ArrowUpRight size={14}/></button>}</div>
        {task.result && <section className="tasks-result"><h3>Результат выполнения</h3><p>{task.result}</p></section>}
        <div className="tasks-detail-actions">
          {mine && task.status==='new' && <button type="button" disabled={busy} className="tasks-primary" onClick={()=>void run('accept')}><Play size={15}/>Принять в работу</button>}
          {mine && task.status==='in_progress' && <button type="button" disabled={busy} className="tasks-primary" onClick={()=>setAction('submit')}><Check size={15}/>{task.requires_review && task.creator_id!==user.id?'Отправить на проверку':'Завершить задачу'}</button>}
          {editor && task.status==='review' && <><button type="button" disabled={busy} className="tasks-primary" onClick={()=>void run('approve')}><Check size={15}/>Подтвердить выполнение</button><button type="button" disabled={busy} className="tasks-secondary" onClick={()=>setAction('return')}>На доработку</button></>}
          {editor && isTaskOpen(task) && <button type="button" disabled={busy} className="tasks-secondary" onClick={()=>setEditing(true)}><Pencil size={14}/>Изменить</button>}
          {editor && <button type="button" disabled={busy} className="tasks-secondary tasks-delete-button" onClick={()=>setAction('delete')}><Trash2 size={14}/>Удалить задачу</button>}
          {editor && <button type="button" disabled={busy} className="tasks-secondary" onClick={()=>setAction(isTaskOpen(task)?'cancel':'reopen')}><RotateCcw size={14}/>{isTaskOpen(task)?'Отменить задачу':'Открыть повторно'}</button>}
          {!editor && mine && isTaskOpen(task) && <button type="button" disabled={busy} className="tasks-secondary" onClick={()=>setAction('reschedule')}><Clock size={14}/>Перенести срок</button>}
        </div>
        {action==='reschedule' ? <Reschedule due={task.due_at} busy={busy} onCancel={()=>setAction('')} onSave={async(due,reason)=>{setBusy(true);setError('');try{await mutateTask(user.sessionToken,'edit',{version:task.version,dueAt:due,comment:reason},task.id);setAction('');}catch(caught){setError(caught instanceof Error?caught.message:'Не удалось перенести срок');void detail.refetch();}finally{setBusy(false);}}}/> : action && <form className="tasks-action-form" onSubmit={event=>{event.preventDefault();void run(action);}}>
          <label>{action==='submit'?'Что сделано?':action==='delete'?'Причина удаления (история сохранится)':'Причина / что нужно доработать'}<textarea required rows={3} maxLength={10000} value={action==='submit'?result:message} onChange={e=>action==='submit'?setResult(e.target.value):setMessage(e.target.value)} disabled={busy}/></label>
          <div><button type="submit" disabled={busy} className="tasks-primary">{busy?'Сохранение…':action==='submit'?'Сохранить результат':action==='delete'?'Удалить задачу':'Подтвердить'}</button><button type="button" disabled={busy} className="tasks-secondary" onClick={()=>setAction('')}>Отмена</button></div>
        </form>}
        {error && <p className="tasks-error" role="alert">{error}</p>}
        <section className="tasks-history"><h3><MessageSquare size={16}/>Обсуждение и история</h3><form onSubmit={event=>{event.preventDefault();void run('comment');}}><label className="tasks-sr-only" htmlFor="task-comment">Комментарий к задаче</label><textarea id="task-comment" maxLength={10000} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Добавить комментарий…" rows={2} disabled={busy}/><button type="submit" aria-label="Отправить комментарий" className="tasks-primary" disabled={busy || !message.trim()}><Send size={15}/></button></form>
          <ol>{[...(detail.data?.events ?? [])].reverse().map(event=><li key={event.id}><div><strong>{names.get(event.actor_id) ?? event.actor_id}</strong><time>{taskDate(event.created_at)}</time></div><span>{TASK_ACTIONS[event.action] ?? event.action}</span>{event.old_value?.due_at && event.new_value?.due_at && event.old_value.due_at!==event.new_value.due_at && <p>Срок: {taskDate(event.old_value.due_at)} → {taskDate(event.new_value.due_at)}</p>}{event.old_value?.assignee_id && event.new_value?.assignee_id && event.old_value.assignee_id!==event.new_value.assignee_id && <p>Ответственный: {names.get(event.old_value.assignee_id)} → {names.get(event.new_value.assignee_id)}</p>}{event.new_value?.observer_id && event.old_value?.observer_id!==event.new_value.observer_id && <p>Наблюдатель: {names.get(event.new_value.observer_id) ?? event.new_value.observer_id}</p>}{event.comment && <p>{event.comment}</p>}</li>)}</ol>
        </section>
      </div>:null}
    </div>
  </div>;
}
function Reschedule({due,busy,onSave,onCancel}:{due:string;busy:boolean;onSave:(due:string,reason:string)=>Promise<void>;onCancel:()=>void}) {
  const local=(value:string)=>{const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);};
  const [next,setNext]=useState(local(due));const [reason,setReason]=useState('');
  return <form className="tasks-action-form" onSubmit={e=>{e.preventDefault();if(!busy && reason.trim())void onSave(new Date(next).toISOString(),reason);}}><label>Новый срок<input required type="datetime-local" value={next} disabled={busy} onChange={e=>setNext(e.target.value)}/></label><label>Причина переноса<textarea required value={reason} maxLength={10000} disabled={busy} onChange={e=>setReason(e.target.value)}/></label><div><button className="tasks-primary" disabled={busy} type="submit">Перенести</button><button type="button" className="tasks-secondary" disabled={busy} onClick={onCancel}>Отмена</button></div></form>;
}
