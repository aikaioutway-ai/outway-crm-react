import { FormEvent, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTaskMetadata, mutateTask } from '../../services/taskService';
import { CrmTask, ROLE_LABELS, TASK_DEPARTMENTS, TASK_OBSERVER_ROLES, taskDepartment, taskLocalDate, TaskTarget } from './taskTypes';
import TaskContextPicker from './TaskContextPicker';
import './TasksModule.css';

export default function TaskComposer({token,target:initialTarget,task,onClose,onSaved}:{token?:string;target?:TaskTarget;task?:CrmTask;onClose:()=>void;onSaved?:()=>void}) {
  const metadata=useTaskMetadata(token);
  const employees=metadata.data?.employees ?? [];
  const [title,setTitle]=useState(task?.title ?? '');
  const [description,setDescription]=useState(task?.description ?? '');
  const [department,setDepartment]=useState<string>();
  const [assignee,setAssignee]=useState(task?.assignee_id ?? '');
  const [observer,setObserver]=useState(task?.observer_id ?? '');
  const [due,setDue]=useState(()=>taskLocalDate(task?.due_at ?? new Date(Date.now()+86400000).toISOString()));
  const [priority,setPriority]=useState(task?.priority ?? 'normal');
  const [review,setReview]=useState(task?.requires_review ?? true);
  const [target,setTarget]=useState<TaskTarget>(task?.target ?? initialTarget ?? {type:'general',id:'',label:'Общая задача'});
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const dialog=useRef<HTMLDivElement>(null);
  const selectedDepartment=department ?? taskDepartment(employees.find(employee=>employee.id===assignee)?.role);
  const recipients=employees.filter(employee=>employee.status==='active' && TASK_DEPARTMENTS[selectedDepartment]?.roles.includes(employee.role));
  const observers=employees.filter(employee=>employee.status==='active' && TASK_OBSERVER_ROLES.includes(employee.role));
  const changedDue=Boolean(task && new Date(due).getTime()!==new Date(task.due_at).getTime());
  const targetReady=target.type==='general' || Boolean(target.id && (!['child','transfer','group'].includes(target.type) || target.schoolKey));
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.querySelector<HTMLElement>('select,input')?.focus();return()=>previous?.focus();},[]);
  const close=()=>{if(!busy)onClose();};
  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    if(busy)return;
    if(!title.trim() || !selectedDepartment || !recipients.some(employee=>employee.id===assignee) || (Boolean(observer) && !observers.some(employee=>employee.id===observer)) || !due || !targetReady || (changedDue && !reason.trim())){
      setError('Заполните название задачи, выберите отдел и ответственного, укажите срок. Если меняете срок — добавьте причину.');return;
    }
    setBusy(true);setError('');
    try {
      await mutateTask(token,task?'edit':'create',{title:title.trim(),description,assigneeId:assignee,observerId:observer || null,dueAt:new Date(due).toISOString(),priority,requiresReview:review,target,comment:reason,...(task?{version:task.version}:{})},task?.id);
      onSaved?.();onClose();
    } catch(caught){setError(caught instanceof Error?caught.message:'Не удалось сохранить задачу');setBusy(false);}
  };
  return <div className="tasks-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)close();}} onKeyDown={event=>{if(event.key==='Escape')close();if(event.key==='Tab' && dialog.current){const elements=Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]'));const first=elements[0],last=elements[elements.length-1];if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}}}}>
    <div ref={dialog} className="tasks-dialog tasks-composer-dialog" role="dialog" aria-modal="true" aria-label={task?'Изменить задачу':'Новая задача'}>
      <header><div><small>ЗАДАЧИ OUTWAY</small><h2>{task?'Изменить задачу':'Новая задача'}</h2><p className="tasks-composer-subtitle">Понятная задача — понятный результат</p></div><button type="button" className="tasks-icon" aria-label="Закрыть задачу" onClick={close} disabled={busy}><X size={18}/></button></header>
      <form onSubmit={submit} className="tasks-form"><fieldset disabled={busy}>
        <div className="tasks-composer-main"><div className="tasks-composer-section"><h3>Основное</h3><p>Укажите, что сделать, кто отвечает и к какому сроку.</p></div>
        <label className="tasks-full">Что нужно сделать<input required maxLength={180} value={title} onChange={event=>setTitle(event.target.value)} placeholder="Например, назначить ребёнку остановку"/></label>
        <label className="tasks-full">Описание и ожидаемый результат<textarea rows={3} maxLength={10000} value={description} onChange={event=>setDescription(event.target.value)} placeholder="Что проверить и какой результат нужен"/></label>
        <label>Отдел ответственного<select required value={selectedDepartment} onChange={event=>{setDepartment(event.target.value);setAssignee('');}}><option value="">Выберите отдел</option>{Object.entries(TASK_DEPARTMENTS).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label>
        <label>Ответственный<select required value={assignee} onChange={event=>setAssignee(event.target.value)} disabled={!selectedDepartment || metadata.isLoading}><option value="">Выберите сотрудника</option>{recipients.map(employee=><option key={employee.id} value={employee.id}>{employee.full_name} · {ROLE_LABELS[employee.role] ?? employee.role}</option>)}</select></label>
        <label>Срок выполнения<input required type="datetime-local" value={due} onChange={event=>setDue(event.target.value)}/></label>
        <label>Приоритет<select value={priority} onChange={event=>setPriority(event.target.value as 'normal'|'urgent')}><option value="normal">Обычный</option><option value="urgent">Срочный</option></select></label>
        </div><aside className="tasks-composer-options"><div className="tasks-composer-section"><h3>Дополнительно</h3><p>Можно поставить задачу без школы и наблюдателя.</p></div><TaskContextPicker token={token} target={target} onChange={setTarget} allowedTypes={metadata.data?.targetTypes}/>
        <label className="tasks-full">Наблюдатель · необязательно<select aria-label="Наблюдатель" value={observer} onChange={event=>setObserver(event.target.value)} disabled={metadata.isLoading}><option value="">Без наблюдателя</option>{TASK_OBSERVER_ROLES.map(role=><optgroup key={role} label={role==='senior_logist'?'Начальник логистики':ROLE_LABELS[role]}>{observers.filter(employee=>employee.role===role).map(employee=><option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</optgroup>)}</select></label>
        <label className="tasks-full tasks-checkbox"><input type="checkbox" checked={review} onChange={event=>setReview(event.target.checked)}/>Постановщик проверяет результат перед закрытием</label>
        {changedDue && <label className="tasks-full">Причина переноса срока<textarea required value={reason} onChange={event=>setReason(event.target.value)} placeholder="Причина сохранится в истории"/></label>}
        </aside>
        {(error || metadata.error) && <div className="tasks-error tasks-full" role="alert">{error || metadata.error?.message}</div>}
        <footer className="tasks-full"><button type="button" className="tasks-secondary" onClick={close}>Отмена</button><button className="tasks-primary" type="submit" disabled={busy || metadata.isLoading || Boolean(metadata.error)}>{busy?'Сохранение…':task?'Сохранить':'Поставить задачу'}</button></footer>
      </fieldset></form>
    </div>
  </div>;
}
