import FilterableTable from '../../core/tables/FilterableTable';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Trash2 } from 'lucide-react';
import { fetchDriverPayments } from '../../services/expenseService';
import { deleteV2DriverAdvance } from '../../services/crmV2Service';
import { queryClient } from '../../services/queryClient';
import { money } from '../../utils/pricing';
import { SCHOOL_TABS } from '../families/constants';
import { DriverPaymentRecord, driverPaymentPeriodLabel, driverPaymentTotals } from './driverPayments';
import './DriverPaymentsPanel.css';
export default function DriverPaymentsPanel({driverId,sessionToken,view,canDeleteAdvance=false}:{driverId:string;sessionToken?:string;view:'finance'|'history';canDeleteAdvance?:boolean}) {
  const query=useQuery<DriverPaymentRecord[]>({queryKey:['driverPayments',driverId,sessionToken],queryFn:()=>fetchDriverPayments(driverId,sessionToken),enabled:Boolean(driverId && sessionToken),refetchOnMount:'always',refetchInterval:30000});
  const [deleting,setDeleting]=useState('');
  const [deleteError,setDeleteError]=useState('');
  const rows:DriverPaymentRecord[]=query.data??[];
  const totals=driverPaymentTotals(rows);
  const paid=totals.reduce((sum,row)=>sum+Math.round(row.total*100),0)/100;
  const remove=async(id:string)=>{
    if(deleting || !window.confirm('Удалить этот аванс?'))return;
    setDeleting(id);setDeleteError('');
    try{await deleteV2DriverAdvance(id);await queryClient.invalidateQueries({queryKey:['driverPayments',driverId]});void queryClient.invalidateQueries({queryKey:['driverAdvances']});void queryClient.invalidateQueries({queryKey:['driverAdvancesForPeriod']});}
    catch(error){setDeleteError(error instanceof Error?error.message:'Не удалось удалить аванс');}finally{setDeleting('');}
  };
  return <section className="driver-payments-panel"><header><div><h3>{view==='finance'?'Фактические выплаты':'История выплат'}</h3><p>Авансы и зарплата выбранного водителя</p></div><strong>{query.isPending || query.isError?'—':money(paid)}</strong><button type="button" className="driver-payments-refresh" aria-label="Обновить выплаты водителя" disabled={query.isFetching} onClick={()=>void query.refetch()}><RefreshCw size={16}/></button></header>
    {(query.error || deleteError || !sessionToken) && <p className="driver-payments-error" role="alert">{query.error?.message || deleteError || 'Для просмотра выплат войдите в CRM'}<button type="button" onClick={()=>void query.refetch()}>Повторить</button></p>}
    {!sessionToken?null:query.isPending?<p className="driver-payments-empty">Загрузка выплат…</p>:!query.isError && !rows.length?<p className="driver-payments-empty">У этого водителя пока нет выплат</p>:!query.isError && <div className="driver-payments-scroll">{view==='finance'?<FilterableTable data-comment-table="drivers/DriverPaymentsPanel:0" data-comment-context={driverId}><thead><tr><th>Месяц</th><th>Авансы</th><th>Зарплата</th><th>Всего выплачено</th></tr></thead><tbody>{totals.map(row=><tr data-comment-row={row.key} key={row.key}><td>{driverPaymentPeriodLabel(row.key)}</td><td>{money(row.advance)}</td><td>{money(row.salary)}</td><td><strong>{money(row.total)}</strong></td></tr>)}</tbody><tfoot><tr><th>Итого</th><td>{money(totals.reduce((sum,row)=>sum+row.advance,0))}</td><td>{money(totals.reduce((sum,row)=>sum+row.salary,0))}</td><td><strong>{money(paid)}</strong></td></tr></tfoot></FilterableTable>:<FilterableTable data-comment-table="drivers/DriverPaymentsPanel:1" data-comment-context={driverId}><thead><tr>{['Когда','Сколько','За какой период','Тип','Школа','Способ оплаты','№ поручения','Комментарий',''].map((label,index)=><th key={index}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr data-comment-row={row.id} key={row.id}><td>{row.date?new Date(`${row.date}T00:00:00`).toLocaleDateString('ru-RU'):'—'}</td><td><strong>{money(row.amount)}</strong></td><td>{driverPaymentPeriodLabel(row.periodKey)}</td><td><span className={`driver-payment-kind ${row.kind}`}>{row.kind==='salary'?'Зарплата':'Аванс'}</span></td><td>{SCHOOL_TABS.find(school=>school.key===row.schoolKey)?.label || row.schoolKey || '—'}</td><td>{row.paymentMethod==='cash'?'Наличные':row.paymentMethod?'АйКай Мбанк':'—'}</td><td>{row.paymentOrderNumber || '—'}</td><td>{row.comment || '—'}</td><td>{row.kind==='advance' && canDeleteAdvance && <button type="button" className="driver-payment-delete" aria-label={`Удалить аванс ${row.sourceId}`} disabled={Boolean(deleting)} onClick={()=>void remove(row.sourceId)}><Trash2 size={14}/></button>}</td></tr>)}</tbody></FilterableTable>}</div>}
  </section>;
}
