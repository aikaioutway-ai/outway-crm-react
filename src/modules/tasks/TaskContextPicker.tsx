import { useEffect, useRef, useState } from 'react';
import { useResolvedTaskTarget, useTaskTargets } from '../../services/taskService';
import { SCHOOL_TABS } from '../families/constants';
import { TARGET_LABELS, TaskTarget, TaskTargetType } from './taskTypes';

const schoolLabel=(key:string)=>SCHOOL_TABS.find(row=>row.key===key)?.label ?? key;
const routeFor=(target:TaskTarget)=>target.type==='group' || target.group ? `group:${target.group}` : target.type==='transfer' ? target.id || (target.transferNumber ? `number:${target.transferNumber}` : '') : target.transferId ?? '';
const isSchoolContext=(target:TaskTarget)=>['school','transfer','child','group'].includes(target.type);

export default function TaskContextPicker({token,target,onChange,allowedTypes}:{token?:string;target:TaskTarget;onChange:(target:TaskTarget)=>void;allowedTypes?:TaskTargetType[]}) {
  const seed=useRef(target).current;
  const [other,setOther]=useState(!isSchoolContext(seed));
  const [school,setSchool]=useState(seed.schoolKey ?? (seed.type==='school'?seed.id:''));
  const [route,setRoute]=useState(routeFor(seed));
  const [child,setChild]=useState(seed.type==='child'?seed.id:'');
  const [search,setSearch]=useState('');
  const [debounced,setDebounced]=useState('');
  const [touched,setTouched]=useState(false);
  const supportsSchools=!allowedTypes || allowedTypes.includes('school');
  const hierarchical=!other && supportsSchools;
  const resolving=useResolvedTaskTarget(token,seed,!touched && isSchoolContext(seed) && ((seed.type==='child' && !seed.schoolKey) || (seed.type==='transfer' && (!seed.schoolKey || !seed.id))));
  const group=route==='group:new'?'new':route==='group:rejected'?'rejected':undefined;
  const pendingTransfer=route.startsWith('number:');
  const transferId=route && !group && !pendingTransfer ? route : undefined;
  const transfers=useTaskTargets(token,'transfer',school,'',hierarchical && Boolean(school));
  const children=useTaskTargets(token,'child',school,debounced,hierarchical && Boolean(school) && !pendingTransfer,{transferId,group});
  const otherTargets=useTaskTargets(token,target.type,school,debounced,!hierarchical && target.type!=='general' && !target.id);
  useEffect(()=>{const timer=setTimeout(()=>setDebounced(search),300);return()=>clearTimeout(timer);},[search]);
  useEffect(()=>{
    if (!pendingTransfer || touched) return;
    const matches=transfers.data?.targets.filter(row=>row.transferNumber===Number(route.slice(7)));
    if(matches?.length===1){setRoute(matches[0].id);onChange(matches[0]);}
  },[pendingTransfer,touched,transfers.data,route,onChange]);
  useEffect(()=>{if(resolving.data && !touched){const resolved=resolving.data.target;setSchool(resolved.schoolKey ?? '');setRoute(routeFor(resolved));setChild(resolved.type==='child'?resolved.id:'');onChange(resolved);}},[resolving.data,touched,onChange]);
  useEffect(()=>{if(!supportsSchools && isSchoolContext(target))onChange({type:'general',id:'',label:'Общая задача'});},[supportsSchools,target,onChange]);
  const baseTarget=(schoolKey:string,selectedRoute:string):TaskTarget=>{
    if(selectedRoute.startsWith('group:')){const selectedGroup=selectedRoute==='group:new'?'new':'rejected';return {type:'group',id:`${schoolKey}:${selectedGroup}`,label:`${schoolLabel(schoolKey)} · ${selectedGroup==='new'?'Новые заявки':'Отказные'}`,schoolKey,group:selectedGroup};}
    if(selectedRoute){return transfers.data?.targets.find(row=>row.id===selectedRoute) ?? {type:'transfer',id:selectedRoute,schoolKey,label:target.transferNumber?`Трансфер № ${target.transferNumber}`:'Трансфер'};}
    return {type:'school',id:schoolKey,label:schoolLabel(schoolKey),schoolKey};
  };
  const changeSchool=(key:string)=>{setTouched(true);setSchool(key);setRoute('');setChild('');setSearch('');onChange(baseTarget(key,''));};
  const changeRoute=(id:string)=>{setTouched(true);setRoute(id);setChild('');setSearch('');onChange(baseTarget(school,id));};
  const changeChild=(id:string)=>{
    setTouched(true);setChild(id);
    if(!id){onChange(baseTarget(school,route));return;}
    const selected=children.data?.targets.find(row=>row.id===id);
    if(!selected)return;
    const selectedGroup=group ?? (!route?selected.group:undefined);
    const selectedTransfer=selectedGroup?undefined:transferId ?? selected.transferId;
    setRoute(selectedGroup?`group:${selectedGroup}`:selectedTransfer ?? '');
    onChange({...selected,schoolKey:school,group:selectedGroup,transferId:selectedTransfer});
  };
  return <section className="tasks-full tasks-context-fields" aria-label="К чему относится задача">
    <h3>К чему относится задача</h3>
    {hierarchical ? <>
      <label className="tasks-full">Школа<select required value={school} onChange={event=>changeSchool(event.target.value)}><option value="">Выберите школу</option>{SCHOOL_TABS.filter(row=>row.key!=='ALL').map(row=><option key={row.key} value={row.key}>{row.label}</option>)}</select></label>
      <label>Трансфер<select value={route} disabled={!school} onChange={event=>changeRoute(event.target.value)}><option value="">Не выбран — задача на школу</option><optgroup label="Заявки"><option value="group:new">Новые</option><option value="group:rejected">Отказные</option></optgroup><optgroup label="Трансферы">{transfers.data?.targets.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}{route && !group && !transfers.data?.targets.some(row=>row.id===route) && <option value={route}>{target.transferNumber?`Трансфер № ${target.transferNumber}`:'Текущий трансфер'}</option>}</optgroup></select></label>
      <label>Ребёнок<select value={child} disabled={!school || pendingTransfer || children.isLoading} onChange={event=>changeChild(event.target.value)}><option value="">{group?'Не выбран — вся группа':route?'Не выбран — весь трансфер':'Не выбран — вся школа'}</option>{children.data?.targets.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}{child && !children.data?.targets.some(row=>row.id===child) && <option value={child}>{target.label}</option>}</select></label>
      <label className="tasks-full">Поиск ребёнка<input value={search} disabled={!school || pendingTransfer} onChange={event=>setSearch(event.target.value)} placeholder="Введите имя, чтобы уточнить список"/></label>
      <p className="tasks-full tasks-hint">Трансфер и ребёнок необязательны. Оставьте оба поля пустыми, чтобы поставить задачу на всю школу.</p>
      {resolving.isLoading && <p className="tasks-full">Уточняем привязку…</p>}
      {((!touched && resolving.error) || transfers.error || children.error) && <p className="tasks-full tasks-error" role="alert">{(!touched && resolving.error?.message) || transfers.error?.message || children.error?.message}</p>}
      {(children.data?.targets.length ?? 0)>=50 && <small className="tasks-full">Показаны первые 50 детей. Уточните поиск.</small>}
      <button type="button" className="tasks-context-switch tasks-full" onClick={()=>{setTouched(true);setOther(true);setSchool('');setSearch('');onChange({type:'general',id:'',label:'Общая задача'});}}>Общая задача, семья или водитель</button>
    </> : <>
      <label className="tasks-full">Привязка<select value={isSchoolContext(target)?'general':target.type} onChange={event=>{const type=event.target.value as TaskTargetType;setTouched(true);setSearch('');onChange({type,id:'',label:TARGET_LABELS[type]});}}>{(['general','family','driver'] as TaskTargetType[]).filter(type=>!allowedTypes || allowedTypes.includes(type)).map(type=><option key={type} value={type}>{TARGET_LABELS[type]}</option>)}</select></label>
      {!isSchoolContext(target) && target.type!=='general' && (target.id ? <div className="tasks-full tasks-selected-target"><span>{target.label}</span><button type="button" onClick={()=>onChange({type:target.type,id:'',label:''})}>Изменить привязку</button></div> : <>
        <label className="tasks-full">Поиск объекта<input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Начните вводить имя"/></label>
        <label className="tasks-full">Выберите объект<select required value="" onChange={event=>{const selected=otherTargets.data?.targets.find(row=>row.id===event.target.value);if(selected)onChange(selected);}}><option value="">Выберите из списка</option>{otherTargets.data?.targets.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
        {otherTargets.error && <p className="tasks-full tasks-error" role="alert">{otherTargets.error.message}</p>}
      </>)}
      {supportsSchools && <button type="button" className="tasks-context-switch tasks-full" onClick={()=>{setOther(false);changeSchool('');}}>Выбрать школу, трансфер или ребёнка</button>}
    </>}
  </section>;
}
