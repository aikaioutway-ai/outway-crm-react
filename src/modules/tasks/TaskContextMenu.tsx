import { useEffect, useRef, useState } from 'react';
import { openTaskComposer, TaskTarget } from './taskTypes';
const EVENT='outway-task-context-menu';
export function showTaskContextMenu(event:{preventDefault:()=>void;stopPropagation:()=>void;clientX:number;clientY:number},target:TaskTarget){
  event.preventDefault();event.stopPropagation();
  window.dispatchEvent(new CustomEvent(EVENT,{detail:{x:event.clientX,y:event.clientY,target}}));
}
export default function TaskContextMenu(){
  const [menu,setMenu]=useState<{x:number;y:number;target:TaskTarget}|null>(null);
  const button=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const open=(event:Event)=>setMenu((event as CustomEvent).detail);
    const close=()=>setMenu(null);
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')close();};
    window.addEventListener(EVENT,open);window.addEventListener('click',close);window.addEventListener('scroll',close,true);window.addEventListener('resize',close);window.addEventListener('keydown',key);
    return()=>{window.removeEventListener(EVENT,open);window.removeEventListener('click',close);window.removeEventListener('scroll',close,true);window.removeEventListener('resize',close);window.removeEventListener('keydown',key);};
  },[]);
  useEffect(()=>{if(menu)button.current?.focus();},[menu]);
  return menu?<div className="dt-ctx-menu" role="menu" style={{position:'fixed',left:Math.max(8,Math.min(menu.x,window.innerWidth-210)),top:Math.max(8,Math.min(menu.y,window.innerHeight-58)),zIndex:2400}}><button ref={button} role="menuitem" className="dt-ctx-item" onClick={()=>{openTaskComposer(menu.target);setMenu(null);}}>＋ Поставить задачу</button></div>:null;
}
