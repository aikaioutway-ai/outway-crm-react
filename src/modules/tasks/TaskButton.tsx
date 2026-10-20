import { ListTodo } from 'lucide-react';
import { openTaskComposer, TaskTarget } from './taskTypes';
export default function TaskButton({target,compact=false,toolbar=false}:{target:TaskTarget;compact?:boolean;toolbar?:boolean}) {
  return <span style={{display:'inline-flex',alignItems:'center',gap:8,flexShrink:0,marginBottom:toolbar?8:0}}><button type="button" title={`Поставить задачу: ${target.label}`} aria-label={`Поставить задачу: ${target.label}`} onClick={event=>{event.stopPropagation();openTaskComposer(target);}}
    style={{display:'inline-flex',alignItems:'center',gap:6,height:compact?26:34,boxSizing:'border-box',whiteSpace:'nowrap',border:'1px solid #CCE2E4',borderRadius:9,background:'#F4FAFA',color:'#207E80',padding:compact?'5px 7px':'7px 10px',fontSize:11,fontWeight:750,cursor:'pointer',flexShrink:0}}>
    <ListTodo size={14}/>{!compact && 'Поставить задачу'}
  </button></span>;
}
