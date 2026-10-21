import { ListTodo } from 'lucide-react';
import { openTaskComposer, TaskTarget } from './taskTypes';
export default function TaskButton({target,compact=false}:{target:TaskTarget;compact?:boolean;toolbar?:boolean}) {
  return <button type="button" className={`ow-btn${compact ? ' ow-btn--sm' : ''}`} title={`Поставить задачу: ${target.label}`} aria-label={`Поставить задачу: ${target.label}`} onClick={event=>{event.stopPropagation();openTaskComposer(target);}}>
    <ListTodo size={14} aria-hidden="true"/>{!compact && 'Задача'}
  </button>;
}
