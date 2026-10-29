import { splitPayment } from '../spending/paymentAmounts';
import { periodAmounts, periodTotal } from './paymentPeriods';
import { useEffect, useRef, useState } from 'react';
import { Plus, Search, Users, X } from 'lucide-react';
import NotionSelect from '../../core/selects/NotionSelect';
import NewDriverModal from '../drivers/NewDriverModal';
import { createPortal } from 'react-dom';
import { queryClient, QK } from '../../services/queryClient';
import { fetchV2DriversTable, V2DriverTableRow } from '../../services/crmV2Service';
import { SCHOOL_TABS, isSchoolVisible } from '../families/constants';

export type DriverPayment = { driverId: string; transferId: string; schoolKey: string; name: string; amount: string; temporary?: boolean; periodAmounts?:Record<string,string> };
type PaymentRow = DriverPayment & { key: number; selected: boolean; choosing?: boolean; openChooser?: boolean };
type Props = { unitPriceMode?:boolean; selectDriverOnly?:boolean; drivers:V2DriverTableRow[]; allDrivers?:V2DriverTableRow[]; school:string; initialSearch?:string; splitTotal?:boolean; compactCards?:boolean; sessionToken?:string; initial:DriverPayment[]; salary:boolean; periods?:{key:string;label:string}[]; onClose:()=>void; onConfirm:(rows:DriverPayment[])=>void; transferSchool:(transfer:V2DriverTableRow['transfers'][number])=>string };

export default function DriverPaymentPicker({unitPriceMode=false,selectDriverOnly=false,drivers,allDrivers=drivers,school,sessionToken,initial,salary,initialSearch='',splitTotal=false,compactCards=false,periods=[],onClose,onConfirm,transferSchool}:Props) {
  const transfers=Array.from(new Map(drivers.flatMap(driver=>driver.transfers).filter(transfer=>isSchoolVisible(transfer.branchShort) && isSchoolVisible(transferSchool(transfer))).map(transfer=>[transfer.id,transfer])).values()).sort((a,b)=>transferSchool(a).localeCompare(transferSchool(b),'ru',{numeric:true}) || String(a.transferNumber).localeCompare(String(b.transferNumber),'ru',{numeric:true}));
  const people=Array.from(new Map(allDrivers.map(driver=>[driver.driverId,driver])).values()).sort((a,b)=>a.fullName.localeCompare(b.fullName,'ru'));
  const [rows,setRows]=useState<PaymentRow[]>(()=>{
    const result:PaymentRow[]=initial.filter(row=>isSchoolVisible(row.schoolKey)).map((row,key)=>({...row,key,selected:true,choosing:Boolean(row.temporary)}));
    for(const transfer of transfers.filter(item=>!school || transferSchool(item)===school)) {
      const driver=drivers.find(item=>item.transfers.some(choice=>choice.id===transfer.id));
      if(!driver || result.some(row=>row.transferId===transfer.id && row.driverId===driver.driverId))continue;
      result.push({key:result.length,selected:false,driverId:driver.driverId,name:driver.fullName,schoolKey:transferSchool(transfer),transferId:transfer.id,amount:''});
    }
    if(!school || ((selectDriverOnly || unitPriceMode) && !salary))for(const driver of drivers.filter(item=>!item.transfers.length)){
      if(!result.some(row=>row.driverId===driver.driverId))result.push({key:result.length,selected:false,driverId:driver.driverId,name:driver.fullName,schoolKey:'',transferId:'',amount:''});
    }
    return result;
  });
  const dragSelection = useRef<{ selected: boolean; visited: Set<number> } | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const finish = () => { dragSelection.current = null; setDragging(false); };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => { window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); };
  }, []);
  const paintSelection = (key: number) => {
    const gesture = dragSelection.current;
    if (!gesture || gesture.visited.has(key)) return;
    gesture.visited.add(key);
    setRows(current => current.map(row => row.key === key ? {...row, selected: gesture.selected} : row));
  };
  const [creatingFor,setCreatingFor]=useState<number|null>(null);
  const nextKey=useRef(rows.length);
  const [search,setSearch]=useState(initialSearch);
  const [commonAmount,setCommonAmount]=useState('');
  const [error,setError]=useState('');
  const dialog=useRef<HTMLDivElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.focus();return()=>previous?.focus();},[]);
  const selected=rows.filter(row=>row.selected);
  const visible=rows.filter(row=>`${row.name} ${row.schoolKey} ${transfers.find(item=>item.id===row.transferId)?.transferNumber??''}`.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))).sort((a,b)=>compactCards && !dragging ? Number(b.selected)-Number(a.selected) || Number(Boolean(a.choosing))-Number(Boolean(b.choosing)) : 0);
  const allVisible=visible.length>0 && visible.every(row=>row.selected);
  const keys=periods.map(period=>period.key);
  const rowTotal=(row:DriverPayment)=>periods.length?periodTotal(periodAmounts(keys,row.amount,row.periodAmounts)):Number(row.amount)||0;
  const total=selected.reduce((sum,row)=>sum+rowTotal(row),0);
  const change=(key:number,patch:Partial<PaymentRow>)=>setRows(current=>current.map(row=>row.key===key?{...row,...patch}:row));
  const addRecipient=(row:PaymentRow)=>{
    const key=nextKey.current++;setSearch('');
    setRows(current=>{const index=compactCards?current.length-1:current.findIndex(item=>item.key===row.key);return [...current.slice(0,index+1),{key,selected:true,schoolKey:row.schoolKey,transferId:row.transferId,driverId:'',name:'',amount:'',temporary:true,choosing:true,openChooser:true},...current.slice(index+1)];});
    return key;
  };
  const assignment=(driverId:string,transferId:string)=>!drivers.some(driver=>driver.driverId===driverId && driver.transfers.some(transfer=>transfer.id===transferId));
  const confirm=()=>{
    if(selectDriverOnly) { if(selected.length !== 1 || !selected[0].driverId) { setError('Выберите одного водителя.'); return; } onConfirm(selected.map(({key: _key,selected: _selected,choosing: _choosing,openChooser: _openChooser,...row}) => row)); return; }
    if(!selected.length || selected.some(row=>!row.driverId || ((salary || row.temporary) && (!row.schoolKey || !row.transferId)) || Object.values(periods.length?periodAmounts(keys,row.amount,row.periodAmounts):{single:row.amount}).some(value=>!Number.isFinite(Number(value)) || Number(value)<=0))){setError('Выберите водителей, школу, трансфер и укажите сумму каждому.');return;}
    if(new Set(selected.map(row=>`${row.driverId}:${row.transferId}`)).size!==selected.length){setError('Один водитель выбран дважды для одного трансфера. Объедините сумму в одной строке.');return;}
    onConfirm(selected.map(({key,selected,choosing,openChooser,...row})=>{
      void key;void selected;void choosing;void openChooser;
      return periods.length?{...row,periodAmounts:periodAmounts(keys,row.amount,row.periodAmounts),amount:String(rowTotal(row))}:row;
    }));
  };
  return <div className="expense-modal-overlay payment-picker-overlay" onMouseDown={event=>{if(event.target===event.currentTarget){event.stopPropagation();onClose();}}}><div ref={dialog} className="expense-modal payment-picker" inert={creatingFor!==null} aria-hidden={creatingFor!==null || undefined} role="dialog" aria-modal="true" aria-label="Выбор водителей и сумм" tabIndex={-1} onKeyDown={event=>{
    if(creatingFor!==null)return;
    if(event.key==='Escape'){event.stopPropagation();onClose();}
    if(event.key==='Tab' && dialog.current){const nodes=Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)'));const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey && (document.activeElement===first || document.activeElement===dialog.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}}
  }}>
    <div className="expense-modal-head"><div><h2><Users size={21}/> {selectDriverOnly ? 'Выбор водителя' : unitPriceMode ? 'Водители и цены' : 'Водители и суммы'}</h2><p>{SCHOOL_TABS.find(tab=>tab.key===school)?.label || 'Все школы'}{selectDriverOnly ? ' · выберите водителя для выезда' : ' · каждому — отдельная выплата'}</p></div><button type="button" className="expense-modal-close" onClick={onClose} aria-label="Закрыть выбор водителей"><X size={18}/></button></div>
    <div className="payment-picker-tools"><label className="payment-picker-search"><Search size={17}/><input aria-label="Поиск водителя" placeholder="Найти водителя" value={search} onChange={event=>setSearch(event.target.value)}/></label>{!selectDriverOnly && <div className="payment-common-amount"><input aria-label="Сумма для всех выбранных" type="number" min="0.01" step="0.01" placeholder={periods.length>1?'Каждому за период':unitPriceMode ? 'Цена каждому' : 'Сумма каждому'} value={commonAmount} onChange={event=>setCommonAmount(event.target.value)}/><button type="button" className="expense-cancel" disabled={!selected.length || !Number.isFinite(Number(commonAmount)) || Number(commonAmount)<=0} onClick={()=>setRows(current=>current.map(row=>row.selected?{...row,amount:commonAmount,periodAmounts:periods.length?Object.fromEntries(keys.map(key=>[key,commonAmount])):undefined}:row))}>Применить</button>{splitTotal && <button type="button" className="expense-cancel" disabled={!selected.length || !Number.isFinite(Number(commonAmount)) || Number(commonAmount)<=0} onClick={()=>{const values=splitPayment(Number(commonAmount),selected.length);setRows(current=>current.map(row=>row.selected?{...row,amount:String(values[selected.findIndex(item=>item.key===row.key)])}:row));}}>Разделить</button>}<button type="button" className="expense-cancel" onClick={()=>addRecipient(selected[0] || rows[0] || {key:-1,selected:false,schoolKey:school,transferId:'',driverId:'',name:'',amount:''})}><Plus size={14} aria-hidden="true"/>Добавить</button></div>}</div>
    {!selectDriverOnly && <div className="payment-picker-select-all"><label><input type="checkbox" checked={allVisible} disabled={!visible.length} onChange={()=>setRows(current=>current.map(row=>visible.some(item=>item.key===row.key)?{...row,selected:!allVisible}:row))}/> Выбрать всех в списке</label><span>{selected.length} выбрано</span></div>}
    <div className={`payment-picker-rows${compactCards ? ' payment-picker-cards' : ''}`}>{!visible.length?<p className="payment-hint">Водители не найдены</p>:visible.map(row=>{
      const identity=row.name || `строки ${row.key+1}`;
      const choices=transfers.filter(transfer=>!row.schoolKey || transferSchool(transfer)===row.schoolKey);
      const transferLabel=transfers.find(item=>item.id===row.transferId)?.transferNumber;
      const previous=visible[visible.indexOf(row)-1], next=visible[visible.indexOf(row)+1];
      const same=(other?:PaymentRow)=>Boolean(other && other.schoolKey===row.schoolKey && other.transferId===row.transferId);
      const options=people.map(driver=>({value:driver.driverId,label:driver.fullName,badge:compactCards ? Array.from(new Set(driver.transfers.map(transfer=>`${SCHOOL_TABS.find(school=>school.key===transferSchool(transfer))?.label || transfer.branchShort} · №${transfer.transferNumber}`))).join(', ') || 'Резерв' : undefined}));
      return <div key={row.key} data-recipient-key={row.key} tabIndex={compactCards ? 0 : undefined} onKeyDown={event => { if (compactCards && event.target === event.currentTarget && (event.key === ' ' || event.key === 'Enter')) { event.preventDefault(); change(row.key,{selected:!row.selected}); } }} onPointerDown={event => {
        if (!compactCards || selectDriverOnly || event.button !== 0 || (event.target as Element).closest('input,button,select,textarea,[role="combobox"]')) return;
        event.preventDefault();
        dragSelection.current = { selected: !row.selected, visited: new Set() };
        setDragging(true);
        paintSelection(row.key);
      }} onPointerEnter={() => { if (compactCards) paintSelection(row.key); }} className={`payment-picker-row payment-transfer-row${row.choosing?' is-choosing':''}${row.selected?' selected':''}${same(previous)?' transfer-group-following':''}${same(next)?' transfer-group-before':''}`}>
        <input type="checkbox" aria-label={identity} checked={row.selected} onChange={()=>selectDriverOnly ? setRows(current=>current.map(item=>({...item,selected:item.key===row.key && !row.selected}))) : change(row.key,{selected:!row.selected})}/>
        <label className="payment-picker-amount">Школа<select aria-label={`Школа для ${identity}`} value={row.schoolKey} onChange={event=>change(row.key,{schoolKey:event.target.value,transferId:'',driverId:'',name:'',temporary:false})}><option value="">Выберите школу</option>{SCHOOL_TABS.filter(item=>item.key!=='ALL' && isSchoolVisible(item.key)).map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
        <label className="payment-picker-amount">Трансфер<select aria-label={`Трансфер для ${identity}`} value={row.transferId} onChange={event=>{const transfer=transfers.find(item=>item.id===event.target.value);const driver=drivers.find(item=>item.transfers.some(choice=>choice.id===transfer?.id));change(row.key,{transferId:transfer?.id??'',schoolKey:transfer?transferSchool(transfer):row.schoolKey,driverId:driver?.driverId??'',name:driver?.fullName??'',temporary:false});}}><option value="">Выберите трансфер</option>{choices.map(transfer=><option key={transfer.id} value={transfer.id}>№{transfer.transferNumber}</option>)}</select></label>
        <div className="payment-picker-amount payment-driver-choice">{compactCards && !row.choosing ? <><strong title={row.name}>{row.name || 'Выберите водителя'}</strong><small>{SCHOOL_TABS.find(item=>item.key===row.schoolKey)?.label || 'Без школы'} · {transferLabel ? `Трансфер №${transferLabel}` : 'Резерв'}</small></> : <><span>Водитель</span><NotionSelect ariaLabel={`Водитель для ${identity}`} value={row.driverId} searchable searchPlaceholder="Поиск водителя в списке" disabled={creatingFor!==null} modalPanel={compactCards} autoFocus={!compactCards && row.openChooser && creatingFor===null} options={options} placeholder="Выберите водителя" footerAction={{label:'Добавить нового',onClick:()=>setCreatingFor(row.choosing?row.key:addRecipient(row))}} onChange={value=>{const driver=people.find(item=>item.driverId===value);const key=!row.choosing && value!==row.driverId?addRecipient(row):row.key;change(key,{driverId:driver?.driverId??'',name:driver?.fullName??'',openChooser:false,temporary:assignment(driver?.driverId??'',row.transferId)});}}/></>}</div>
        {!selectDriverOnly && <div className="payment-picker-amounts">{(periods.length?periods:[{key:'single',label:unitPriceMode ? 'Цена, сом' : 'Сумма, сом'}]).map(period=><label className="payment-picker-amount" key={period.key}>{period.label}<input aria-label={periods.length?`Сумма для ${identity} за ${period.label}`:`Сумма для ${identity}`} disabled={!compactCards && !row.selected} type="number" min="0.01" step="0.01" placeholder="0" onKeyDown={event=>{if(!splitTotal || event.key!=='Tab')return;const inputs=Array.from(dialog.current?.querySelectorAll<HTMLInputElement>('.payment-picker-amounts input:not(:disabled)')||[]);const next=inputs[inputs.indexOf(event.currentTarget)+(event.shiftKey?-1:1)];if(next){event.preventDefault();event.stopPropagation();next.focus();next.select();}}} value={periods.length?periodAmounts(keys,row.amount,row.periodAmounts)[period.key]:row.amount} onChange={event=>{if(!periods.length){change(row.key,{amount:event.target.value,...(compactCards && event.target.value !== '' ? {selected:true} : {})});return;}const values={...periodAmounts(keys,row.amount,row.periodAmounts),[period.key]:event.target.value};change(row.key,{periodAmounts:values,amount:String(periodTotal(values)),...(compactCards && event.target.value !== '' ? {selected:true} : {})});}}/></label>)}</div>}
        {row.choosing?<button type="button" className="expense-cancel" aria-label={`Удалить получателя ${identity}`} onClick={()=>setRows(current=>current.filter(item=>item.key!==row.key))}><X size={16}/></button>:<button type="button" className="expense-cancel" disabled={!row.schoolKey || !row.transferId} aria-label={`Добавить водителя к ${row.schoolKey} · № ${transferLabel??''}`} onClick={()=>addRecipient(row)} hidden={compactCards}><Plus size={16}/></button>}

      </div>;
    })}</div>
    {error && <p className="expense-form-error" role="alert">{error}</p>}
    <div className="payment-picker-footer"><div><span>Итого · {selected.length} водителей</span>{!selectDriverOnly && <strong>{total.toLocaleString('ru-RU')}</strong>}</div><button type="button" className="expense-cancel" onClick={onClose}>Отмена</button><button type="button" className="expenses-add" onClick={confirm}>Готово</button></div>
  </div>{creatingFor!==null && createPortal(<NewDriverModal sessionToken={sessionToken} branches={[]} paymentRecipientOnly onClose={()=>setCreatingFor(null)} onCreated={async driverId=>{try{const refreshed=await fetchV2DriversTable();queryClient.setQueryData(QK.driversTable,refreshed);const driver=refreshed.find(item=>item.driverId===driverId);if(driver)change(creatingFor,{driverId:driver.driverId,name:driver.fullName,temporary:true,choosing:true,openChooser:false,selected:true});setCreatingFor(null);}catch{setError('Водитель создан. Не удалось обновить список — закройте и снова откройте выбор получателей.');setCreatingFor(null);}}}/>,document.body)}</div>;
}
