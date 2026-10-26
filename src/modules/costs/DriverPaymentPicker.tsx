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
type PaymentRow = DriverPayment & { key: number; selected: boolean; choosing?: boolean };
type Props = { drivers:V2DriverTableRow[]; allDrivers?:V2DriverTableRow[]; school:string; initial:DriverPayment[]; salary:boolean; periods?:{key:string;label:string}[]; onClose:()=>void; onConfirm:(rows:DriverPayment[])=>void; transferSchool:(transfer:V2DriverTableRow['transfers'][number])=>string };

export default function DriverPaymentPicker({drivers,allDrivers=drivers,school,initial,salary,periods=[],onClose,onConfirm,transferSchool}:Props) {
  const transfers=Array.from(new Map(drivers.flatMap(driver=>driver.transfers).filter(transfer=>isSchoolVisible(transfer.branchShort) && isSchoolVisible(transferSchool(transfer))).map(transfer=>[transfer.id,transfer])).values()).sort((a,b)=>transferSchool(a).localeCompare(transferSchool(b),'ru',{numeric:true}) || String(a.transferNumber).localeCompare(String(b.transferNumber),'ru',{numeric:true}));
  const people=Array.from(new Map(allDrivers.map(driver=>[driver.driverId,driver])).values()).sort((a,b)=>a.fullName.localeCompare(b.fullName,'ru'));
  const [rows,setRows]=useState<PaymentRow[]>(()=>{
    const result:PaymentRow[]=initial.filter(row=>isSchoolVisible(row.schoolKey)).map((row,key)=>({...row,key,selected:true,choosing:Boolean(row.temporary)}));
    for(const transfer of transfers.filter(item=>!school || transferSchool(item)===school)) {
      const driver=drivers.find(item=>item.transfers.some(choice=>choice.id===transfer.id));
      if(!driver || result.some(row=>row.transferId===transfer.id && row.driverId===driver.driverId))continue;
      result.push({key:result.length,selected:false,driverId:driver.driverId,name:driver.fullName,schoolKey:transferSchool(transfer),transferId:transfer.id,amount:''});
    }
    if(!school && !salary)for(const driver of drivers.filter(item=>!item.transfers.length)){
      if(!result.some(row=>row.driverId===driver.driverId))result.push({key:result.length,selected:false,driverId:driver.driverId,name:driver.fullName,schoolKey:'',transferId:'',amount:''});
    }
    return result;
  });
  const [creatingFor,setCreatingFor]=useState<number|null>(null);
  const nextKey=useRef(rows.length);
  const [search,setSearch]=useState('');
  const [commonAmount,setCommonAmount]=useState('');
  const [error,setError]=useState('');
  const dialog=useRef<HTMLDivElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.focus();return()=>previous?.focus();},[]);
  const selected=rows.filter(row=>row.selected);
  const visible=rows.filter(row=>`${row.name} ${row.schoolKey} ${transfers.find(item=>item.id===row.transferId)?.transferNumber??''}`.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')));
  const allVisible=visible.length>0 && visible.every(row=>row.selected);
  const keys=periods.map(period=>period.key);
  const rowTotal=(row:DriverPayment)=>periods.length?periodTotal(periodAmounts(keys,row.amount,row.periodAmounts)):Number(row.amount)||0;
  const total=selected.reduce((sum,row)=>sum+rowTotal(row),0);
  const change=(key:number,patch:Partial<PaymentRow>)=>setRows(current=>current.map(row=>row.key===key?{...row,...patch}:row));
  const addRecipient=(row:PaymentRow)=>{
    const key=nextKey.current++;setSearch('');
    setRows(current=>{const index=current.findIndex(item=>item.key===row.key);return [...current.slice(0,index+1),{key,selected:true,schoolKey:row.schoolKey,transferId:row.transferId,driverId:'',name:'',amount:'',temporary:true,choosing:true},...current.slice(index+1)];});
    return key;
  };
  const assignment=(driverId:string,transferId:string)=>!drivers.some(driver=>driver.driverId===driverId && driver.transfers.some(transfer=>transfer.id===transferId));
  const confirm=()=>{
    if(!selected.length || selected.some(row=>!row.driverId || ((salary || row.temporary) && (!row.schoolKey || !row.transferId)) || Object.values(periods.length?periodAmounts(keys,row.amount,row.periodAmounts):{single:row.amount}).some(value=>!Number.isFinite(Number(value)) || Number(value)<=0))){setError('Выберите водителей, школу, трансфер и укажите сумму каждому.');return;}
    if(new Set(selected.map(row=>`${row.driverId}:${row.transferId}`)).size!==selected.length){setError('Один водитель выбран дважды для одного трансфера. Объедините сумму в одной строке.');return;}
    onConfirm(selected.map(({key,selected,choosing,...row})=>{
      void key;void selected;void choosing;
      return periods.length?{...row,periodAmounts:periodAmounts(keys,row.amount,row.periodAmounts),amount:String(rowTotal(row))}:row;
    }));
  };
  return <div className="expense-modal-overlay payment-picker-overlay" onMouseDown={event=>{if(event.target===event.currentTarget){event.stopPropagation();onClose();}}}><div ref={dialog} className="expense-modal payment-picker" inert={creatingFor!==null} aria-hidden={creatingFor!==null || undefined} role="dialog" aria-modal="true" aria-label="Выбор водителей и сумм" tabIndex={-1} onKeyDown={event=>{
    if(creatingFor!==null)return;
    if(event.key==='Escape'){event.stopPropagation();onClose();}
    if(event.key==='Tab' && dialog.current){const nodes=Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)'));const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey && (document.activeElement===first || document.activeElement===dialog.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}}
  }}>
    <div className="expense-modal-head"><div><h2><Users size={21}/> Водители и суммы</h2><p>{SCHOOL_TABS.find(tab=>tab.key===school)?.label || 'Все школы'} · каждому — отдельная выплата</p></div><button type="button" className="expense-modal-close" onClick={onClose} aria-label="Закрыть выбор водителей"><X size={18}/></button></div>
    <div className="payment-picker-tools"><label className="payment-picker-search"><Search size={17}/><input aria-label="Поиск водителя" placeholder="Найти водителя" value={search} onChange={event=>setSearch(event.target.value)}/></label><div className="payment-common-amount"><input aria-label="Сумма для всех выбранных" type="number" min="0.01" step="0.01" placeholder={periods.length>1?'Каждому за период':'Сумма каждому'} value={commonAmount} onChange={event=>setCommonAmount(event.target.value)}/><button type="button" className="expense-cancel" disabled={!selected.length || !Number.isFinite(Number(commonAmount)) || Number(commonAmount)<=0} onClick={()=>setRows(current=>current.map(row=>row.selected?{...row,amount:commonAmount,periodAmounts:periods.length?Object.fromEntries(keys.map(key=>[key,commonAmount])):undefined}:row))}>Применить выбранным</button></div></div>
    <div className="payment-picker-select-all"><label><input type="checkbox" checked={allVisible} disabled={!visible.length} onChange={()=>setRows(current=>current.map(row=>visible.some(item=>item.key===row.key)?{...row,selected:!allVisible}:row))}/> Выбрать всех в списке</label><span>{selected.length} выбрано</span></div>
    <div className="payment-picker-rows">{!visible.length?<p className="payment-hint">Водители не найдены</p>:visible.map(row=>{
      const identity=row.name || `строки ${row.key+1}`;
      const choices=transfers.filter(transfer=>!row.schoolKey || transferSchool(transfer)===row.schoolKey);
      const transferLabel=transfers.find(item=>item.id===row.transferId)?.transferNumber;
      const previous=visible[visible.indexOf(row)-1], next=visible[visible.indexOf(row)+1];
      const same=(other?:PaymentRow)=>Boolean(other && other.schoolKey===row.schoolKey && other.transferId===row.transferId);
      const currentDriver=drivers.find(driver=>driver.transfers.some(item=>item.id===row.transferId));
      const options=row.choosing?people.map(driver=>({value:driver.driverId,label:driver.fullName})):[...(row.driverId?[{value:row.driverId,label:row.name}]:currentDriver?[{value:currentDriver.driverId,label:currentDriver.fullName}]:[]),{value:'__add',label:'Добавить водителя'}];
      return <div key={row.key} className={`payment-picker-row payment-transfer-row${row.selected?' selected':''}${same(previous)?' transfer-group-following':''}${same(next)?' transfer-group-before':''}`}>
        <input type="checkbox" aria-label={identity} checked={row.selected} onChange={()=>change(row.key,{selected:!row.selected})}/>
        <label className="payment-picker-amount">Школа<select aria-label={`Школа для ${identity}`} value={row.schoolKey} onChange={event=>change(row.key,{schoolKey:event.target.value,transferId:'',driverId:'',name:'',temporary:false})}><option value="">Выберите школу</option>{SCHOOL_TABS.filter(item=>item.key!=='ALL' && isSchoolVisible(item.key)).map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
        <label className="payment-picker-amount">Трансфер<select aria-label={`Трансфер для ${identity}`} value={row.transferId} onChange={event=>{const transfer=transfers.find(item=>item.id===event.target.value);const driver=drivers.find(item=>item.transfers.some(choice=>choice.id===transfer?.id));change(row.key,{transferId:transfer?.id??'',schoolKey:transfer?transferSchool(transfer):row.schoolKey,driverId:driver?.driverId??'',name:driver?.fullName??'',temporary:false});}}><option value="">Выберите трансфер</option>{choices.map(transfer=><option key={transfer.id} value={transfer.id}>{transfer.branchShort} · № {transfer.transferNumber}</option>)}</select></label>
        <div className="payment-picker-amount payment-driver-choice"><span>Водитель</span><NotionSelect ariaLabel={`Водитель для ${identity}`} value={row.driverId} disabled={creatingFor!==null} autoFocus={row.choosing && creatingFor===null} options={options} placeholder="Выберите водителя" footerAction={{label:'Добавить нового водителя',onClick:()=>setCreatingFor(row.choosing?row.key:addRecipient(row))}} onChange={value=>{if(value==='__add'){addRecipient(row);return;}const driver=people.find(item=>item.driverId===value);change(row.key,{driverId:driver?.driverId??'',name:driver?.fullName??'',temporary:assignment(driver?.driverId??'',row.transferId)});}}/></div>
        <div className="payment-picker-amounts">{(periods.length?periods:[{key:'single',label:'Сумма, сом'}]).map(period=><label className="payment-picker-amount" key={period.key}>{period.label}<input aria-label={periods.length?`Сумма для ${identity} за ${period.label}`:`Сумма для ${identity}`} disabled={!row.selected} type="number" min="0.01" step="0.01" placeholder="0" value={periods.length?periodAmounts(keys,row.amount,row.periodAmounts)[period.key]:row.amount} onChange={event=>{if(!periods.length){change(row.key,{amount:event.target.value});return;}const values={...periodAmounts(keys,row.amount,row.periodAmounts),[period.key]:event.target.value};change(row.key,{periodAmounts:values,amount:String(periodTotal(values))});}}/></label>)}</div>
        <button type="button" className="expense-cancel" disabled={!row.schoolKey || !row.transferId} aria-label={`Добавить водителя к ${row.schoolKey} · № ${transferLabel??''}`} onClick={()=>addRecipient(row)}><Plus size={16}/></button>
      </div>;
    })}</div>
    {error && <p className="expense-form-error" role="alert">{error}</p>}
    <div className="payment-picker-footer"><div><span>Итого · {selected.length} водителей</span><strong>{total.toLocaleString('ru-RU')}</strong></div><button type="button" className="expense-cancel" onClick={onClose}>Отмена</button><button type="button" className="expenses-add" onClick={confirm}>Готово</button></div>
  </div>{creatingFor!==null && createPortal(<NewDriverModal branches={[]} paymentRecipientOnly onClose={()=>setCreatingFor(null)} onCreated={async driverId=>{try{const refreshed=await fetchV2DriversTable();queryClient.setQueryData(QK.driversTable,refreshed);const driver=refreshed.find(item=>item.driverId===driverId);if(driver)change(creatingFor,{driverId:driver.driverId,name:driver.fullName,temporary:true,choosing:true,selected:true});setCreatingFor(null);}catch{setError('Водитель создан. Не удалось обновить список — закройте и снова откройте выбор получателей.');setCreatingFor(null);}}}/>,document.body)}</div>;
}
