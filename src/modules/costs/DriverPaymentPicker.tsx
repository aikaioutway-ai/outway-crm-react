import { periodAmounts, periodTotal } from './paymentPeriods';
import { useEffect, useRef, useState } from 'react';
import { Search, Users, X } from 'lucide-react';
import { V2DriverTableRow } from '../../services/crmV2Service';
import { SCHOOL_TABS, isSchoolVisible } from '../families/constants';

export type DriverPayment = { driverId: string; transferId: string; schoolKey: string; name: string; amount: string; periodAmounts?:Record<string,string> };
export default function DriverPaymentPicker({drivers,school,initial,salary,periods=[],onClose,onConfirm,transferSchool}:{drivers:V2DriverTableRow[];school:string;initial:DriverPayment[];salary:boolean;periods?:{key:string;label:string}[];onClose:()=>void;onConfirm:(rows:DriverPayment[])=>void;transferSchool:(transfer:V2DriverTableRow['transfers'][number])=>string}) {
  const orderedTransfers=(driver:V2DriverTableRow,filter=school)=>driver.transfers.filter(transfer=>isSchoolVisible(transfer.branchShort) && isSchoolVisible(transferSchool(transfer)) && (!filter || transferSchool(transfer)===filter)).slice().sort((a,b)=>transferSchool(a).localeCompare(transferSchool(b),'ru',{numeric:true}) || String(a.transferNumber).localeCompare(String(b.transferNumber),'ru',{numeric:true}));
  const [rows,setRows]=useState(()=>initial.filter(row=>isSchoolVisible(row.schoolKey)).map(row=>{
    const driver=drivers.find(driver=>driver.driverId===row.driverId);
    const choices=driver?orderedTransfers(driver):[];
    const current=driver?.transfers.find(transfer=>transfer.id===row.transferId) ?? choices[0] ?? (driver?orderedTransfers(driver,'')[0]:undefined);
    return {...row,transferId:current?.id??'',schoolKey:current?transferSchool(current):row.schoolKey};
  }));
  const [search,setSearch]=useState('');
  const [commonAmount,setCommonAmount]=useState('');
  const [error,setError]=useState('');
  const dialog=useRef<HTMLDivElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.focus();return()=>previous?.focus();},[]);
  const visible=drivers.filter(driver=>(!driver.transfers.length || orderedTransfers(driver,'').length>0) && (!school || driver.transfers.some(transfer=>transferSchool(transfer)===school)) && driver.fullName.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))).sort((a,b)=>{const first=orderedTransfers(a)[0],second=orderedTransfers(b)[0];if(!first)return second?1:a.fullName.localeCompare(b.fullName,'ru');if(!second)return -1;return transferSchool(first).localeCompare(transferSchool(second),'ru',{numeric:true}) || String(first.transferNumber).localeCompare(String(second.transferNumber),'ru',{numeric:true}) || a.fullName.localeCompare(b.fullName,'ru');});
  const makeRow=(driver:V2DriverTableRow):DriverPayment=>{
    const choices=orderedTransfers(driver);
    const transfer=choices[0];
    return {driverId:driver.driverId,name:driver.fullName,transferId:transfer?.id??'',schoolKey:transfer?transferSchool(transfer):school,amount:commonAmount,periodAmounts:periods.length?Object.fromEntries(periods.map(period=>[period.key,commonAmount])):undefined};
  };
  const toggle=(driver:V2DriverTableRow)=>setRows(current=>current.some(row=>row.driverId===driver.driverId)?current.filter(row=>row.driverId!==driver.driverId):[...current,makeRow(driver)]);
  const allVisible=visible.length>0 && visible.every(driver=>rows.some(row=>row.driverId===driver.driverId));
  const total=rows.reduce((sum,row)=>sum+(periods.length?periodTotal(periodAmounts(periods.map(period=>period.key),row.amount,row.periodAmounts)):Number(row.amount)||0),0);
  const confirm=()=>{
    if(!rows.length || rows.some(row=>(periods.length ? Object.values(periodAmounts(periods.map(period=>period.key),row.amount,row.periodAmounts)).some(value=>!Number.isFinite(Number(value)) || Number(value)<=0) : !Number.isFinite(Number(row.amount)) || Number(row.amount)<=0) || ((salary || drivers.find(driver=>driver.driverId===row.driverId)?.transfers.length) && !row.transferId))){setError('Выберите водителей, укажите сумму каждому и трансфер, если он есть.');return;}
    onConfirm(rows.map(row=>periods.length?{...row,periodAmounts:periodAmounts(periods.map(period=>period.key),row.amount,row.periodAmounts),amount:String(periodTotal(periodAmounts(periods.map(period=>period.key),row.amount,row.periodAmounts)))}:row));
  };
  return <div className="expense-modal-overlay payment-picker-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><div ref={dialog} className="expense-modal payment-picker" role="dialog" aria-modal="true" aria-label="Выбор водителей и сумм" tabIndex={-1} onKeyDown={event=>{
    if(event.key==='Escape'){event.stopPropagation();onClose();}
    if(event.key==='Tab' && dialog.current){const nodes=Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)'));const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey && (document.activeElement===first || document.activeElement===dialog.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}}
  }}>
    <div className="expense-modal-head"><div><h2><Users size={21}/> Водители и суммы</h2><p>{SCHOOL_TABS.find(tab=>tab.key===school)?.label || 'Все школы'} · каждому — отдельная выплата</p></div><button type="button" className="expense-modal-close" onClick={onClose} aria-label="Закрыть выбор водителей"><X size={18}/></button></div>
    <div className="payment-picker-tools"><label className="payment-picker-search"><Search size={17}/><input aria-label="Поиск водителя" placeholder="Найти водителя" value={search} onChange={event=>setSearch(event.target.value)}/></label><div className="payment-common-amount"><input aria-label="Сумма для всех выбранных" type="number" min="0.01" step="0.01" placeholder={periods.length>1?"Каждому за период":"Сумма каждому"} value={commonAmount} onChange={event=>setCommonAmount(event.target.value)}/><button type="button" className="expense-cancel" disabled={!rows.length || !Number.isFinite(Number(commonAmount)) || Number(commonAmount)<=0} onClick={()=>setRows(current=>current.map(row=>({...row,amount:commonAmount,periodAmounts:periods.length?Object.fromEntries(periods.map(period=>[period.key,commonAmount])):undefined})))}>Применить выбранным</button></div></div>
    <div className="payment-picker-select-all"><label><input type="checkbox" checked={allVisible} disabled={!visible.length} onChange={()=>setRows(current=>allVisible?current.filter(row=>!visible.some(driver=>driver.driverId===row.driverId)):[...current,...visible.filter(driver=>!current.some(row=>row.driverId===driver.driverId)).map(makeRow)])}/> Выбрать всех в списке</label><span>{rows.length} выбрано</span></div>
    <div className="payment-picker-rows">{visible.length===0?<p className="payment-hint">Водители не найдены</p>:visible.map(driver=>{
      const row=rows.find(item=>item.driverId===driver.driverId);
      const choices=orderedTransfers(driver,'').filter(transfer=>!school || transferSchool(transfer)===school || transfer.id===row?.transferId);
      const displayedTransfer=row?.transferId || choices[0]?.id || '';
      return <div key={driver.driverId} className={`payment-picker-row${row?' selected':''}`}><label className="payment-picker-person"><input type="checkbox" checked={Boolean(row)} onChange={()=>toggle(driver)}/><span><strong>{driver.fullName}</strong><small>{driver.transfers.length ? orderedTransfers(driver).map(transfer=>`${transfer.branchShort} · № ${transfer.transferNumber}`).join(', ') : 'Без назначенного трансфера'}</small></span></label><select aria-label={`Трансфер для ${driver.fullName}`} disabled={!row} value={displayedTransfer} onChange={event=>{const transfer=choices.find(item=>item.id===event.target.value);setRows(current=>current.map(item=>item.driverId===driver.driverId?{...item,transferId:transfer?.id??'',schoolKey:transfer?transferSchool(transfer):school}:item));}}><option value="">{choices.length?'Выберите трансфер':'Нет трансфера'}</option>{choices.map(transfer=><option key={transfer.id} value={transfer.id}>{transfer.branchShort} · № {transfer.transferNumber}</option>)}</select><div className="payment-picker-amounts">{(periods.length?periods:[{key:'single',label:'Сумма, сом'}]).map(period=><label className="payment-picker-amount" key={period.key}>{period.label}<input aria-label={periods.length?`Сумма для ${driver.fullName} за ${period.label}`:`Сумма для ${driver.fullName}`} disabled={!row} type="number" min="0.01" step="0.01" placeholder="0" value={row?(periods.length?periodAmounts(periods.map(item=>item.key),row.amount,row.periodAmounts)[period.key]:row.amount):''} onChange={event=>setRows(current=>current.map(item=>{if(item.driverId!==driver.driverId)return item;if(!periods.length)return {...item,amount:event.target.value};const values={...periodAmounts(periods.map(item=>item.key),item.amount,item.periodAmounts),[period.key]:event.target.value};return {...item,periodAmounts:values,amount:String(periodTotal(values))};}))}/></label>)}</div></div>;
    })}</div>
    {error && <p className="expense-form-error" role="alert">{error}</p>}
    <div className="payment-picker-footer"><div><span>Итого · {rows.length} водителей</span><strong>{total.toLocaleString('ru-RU')} сом</strong></div><button type="button" className="expense-cancel" onClick={onClose}>Отмена</button><button type="button" className="expenses-add" onClick={confirm}>Готово</button></div>
  </div></div>;
}
