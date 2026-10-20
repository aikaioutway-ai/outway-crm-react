import PaymentPeriodPicker from './PaymentPeriodPicker';
import { periodAmounts, periodTotal } from './paymentPeriods';
import DriverPaymentPicker, { DriverPayment } from './DriverPaymentPicker';
import { createExpense } from '../../services/expenseService';
import { currentSchoolYear, salaryExpensePeriods } from './salaryExpensePeriods';
import { EMPLOYEE_DEPARTMENTS } from '../employees/employeeDepartments';
import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useDriversTable, useEmployees } from '../../hooks/useCrmQueries';
import { createEmployeeAdvance } from '../../services/employeeService';
import { createV2DriverAdvance } from '../../services/crmV2Service';
import { queryClient } from '../../services/queryClient';
import { getBranchFilter, SCHOOL_TABS } from '../families/constants';

export default function EmployeeAdvanceModal({ onClose, onSaved, sessionToken }: { onClose: () => void; onSaved: () => void; sessionToken?: string }) {
  const { data: employees = [], isLoading, error: loadError } = useEmployees();
  const { data: drivers = [], isLoading: driversLoading, error: driversError } = useDriversTable();
  const [paymentType, setPaymentType] = useState('advance');
  const [officeDepartment, setOfficeDepartment] = useState('');
  const [selectedPeriods,setSelectedPeriods]=useState<string[]>([]);
  const [officeAmounts,setOfficeAmounts]=useState<Record<string,string>>({});
  const [periodPickerOpen,setPeriodPickerOpen]=useState(false);
  const salaryPeriods = salaryExpensePeriods(currentSchoolYear());
  const [pickerOpen,setPickerOpen]=useState(false);
  const [driverPayments, setDriverPayments] = useState<DriverPayment[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const completed = useRef(new Set<string>());
  const inFlight = useRef(false);
  const [department, setDepartment] = useState('office');
  const [school, setSchool] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cashless');
  const [number, setNumber] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recipients = employees.filter(employee => employee.status === 'active' && employee.role !== 'driver' && (!officeDepartment || EMPLOYEE_DEPARTMENTS.find(item => item.key === officeDepartment)?.roles.includes(employee.role)));
  const activeDrivers = drivers.filter(driver => driver.status === 'active');
  const transferSchool = (transfer: typeof drivers[number]['transfers'][number]) => SCHOOL_TABS.find(tab => tab.key !== 'ALL' && (tab.key === transfer.branchShort || tab.label === transfer.branchShort))?.key ?? getBranchFilter(transfer.branchShort, transfer.branchCode);
  const loading = department === 'drivers' ? driversLoading : isLoading;
  const loadingError = department === 'drivers' ? driversError : loadError;
  const batch = driverPayments;
  const total = department === 'drivers' ? batch.reduce((sum,row)=>sum+(selectedPeriods.length?periodTotal(periodAmounts(selectedPeriods,row.amount,row.periodAmounts)):Number(row.amount)||0),0) : selectedPeriods.length>1?periodTotal(periodAmounts(selectedPeriods,amount,officeAmounts)):Number(amount)||0;
  const overlayOpen=pickerOpen || periodPickerOpen;
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const validAmount=(value:string)=>Number.isFinite(Number(value)) && Number(value)>0;
    if(!selectedPeriods.length || selectedPeriods.some(key=>!salaryPeriods.some(period=>period.key===key))){setError('Выберите периоды выплаты');return;}
    if(!department || !date || (department==='drivers'
      ? !batch.length || batch.some(row=>Object.values(periodAmounts(selectedPeriods,row.amount,row.periodAmounts)).some(value=>!validAmount(value)) || !activeDrivers.some(driver=>driver.driverId===row.driverId && (!driver.transfers.length || driver.transfers.some(transfer=>transfer.id===row.transferId && transferSchool(transfer)===row.schoolKey))))
      : !recipients.some(row=>row.id===employeeId) || Object.values(periodAmounts(selectedPeriods,amount,selectedPeriods.length>1?officeAmounts:undefined)).some(value=>!validAmount(value)))){setError('Выберите получателей и укажите сумму за каждый период');return;}
    if(paymentType==='salary' && (department==='drivers'?batch.some(row=>!row.schoolKey || !row.transferId):!officeDepartment)){setError('Выберите школу с трансфером или отдел');return;}
    const units=department==='drivers'?batch.map(row=>({id:row.driverId,name:row.name,schoolKey:row.schoolKey,transferId:row.transferId,amounts:periodAmounts(selectedPeriods,row.amount,row.periodAmounts)})):[{id:employeeId,name:recipients.find(row=>row.id===employeeId)?.fullName??'',schoolKey:'OFFICE',transferId:'',amounts:periodAmounts(selectedPeriods,amount,selectedPeriods.length>1?officeAmounts:undefined)}];
    const paymentCount=units.length*selectedPeriods.length;
    inFlight.current=true;setBusy(true);setError('');
    try {
      for(const unit of units){
        for(const key of selectedPeriods){
          const completionKey=`${department}:${unit.id}:${key}`;
          if(completed.current.has(completionKey))continue;
          const [year,month]=key.split('-').map(Number);
          const paymentAmount=Number(unit.amounts[key]);
          if(paymentType==='salary'){
            await createExpense({name:`ЗП — ${unit.name}`,category:department==='drivers'?'school':'office',subcategory:'ЗП',schoolKey:department==='drivers'?unit.schoolKey:undefined,departmentKey:department==='office'?officeDepartment:undefined,salaryPeriodKey:key,driverId:department==='drivers'?unit.id:undefined,employeeId:department==='office'?unit.id:undefined,transferId:department==='drivers'?unit.transferId:undefined,unitPrice:paymentAmount,quantity:1,expenseDate:date,paymentMethod:method==='cash'?'cash':'cashless',paymentOrderNumber:number,comment},sessionToken);
          }else if(department==='drivers'){
            await createV2DriverAdvance({driverId:unit.id,transferId:unit.transferId||undefined,schoolKey:unit.schoolKey||undefined,amount:paymentAmount,date,comment,periodMonth:month,periodYear:year,salaryPeriodKey:key,paymentMethod:method,paymentOrderNumber:number});
          }else{
            await createEmployeeAdvance(unit.id,paymentAmount,date,comment,{periodMonth:month,periodYear:year,schoolKey:'OFFICE',salaryPeriodKey:key,paymentMethod:method,paymentOrderNumber:number});
          }
          completed.current.add(completionKey);setSavedCount(completed.current.size);
        }
      }
      void queryClient.invalidateQueries({queryKey:['driverAdvances']});
      void queryClient.invalidateQueries({queryKey:['driverAdvancesForPeriod']});
      void queryClient.invalidateQueries({queryKey:['employeeAdvances']});
      void queryClient.invalidateQueries({queryKey:['driverPayments']});
      onSaved();onClose();
    } catch (caught) {
      const message=caught instanceof Error?caught.message:'Не удалось сохранить выплату';
      setError(completed.current.size ? `Сохранено ${completed.current.size} из ${paymentCount}. ${message}. Повторите сохранение — уже сохранённые выплаты будут пропущены.` : message);
      if(completed.current.size){void queryClient.invalidateQueries({queryKey:['driverPayments']});onSaved();}
    } finally {inFlight.current=false;setBusy(false);}
  };
  return <div className="expense-modal-overlay"><div className="expense-modal payment-main-modal" role="dialog" aria-modal={!overlayOpen} aria-hidden={overlayOpen || undefined} inert={overlayOpen} aria-label="Новая выплата"><div className="expense-modal-head"><h2>Новая выплата</h2><button className="expense-modal-close" disabled={busy} onClick={onClose} aria-label="Закрыть"><X size={18} /></button></div><form onSubmit={save} className="expense-form"><fieldset disabled={busy || savedCount > 0} style={{ display: 'contents' }}>
    <div className="expense-field full"><span id="payment-type-label">Тип выплаты</span><div className="payment-segments" role="group" aria-labelledby="payment-type-label">{[{key:'advance',label:'Аванс'},{key:'salary',label:'Зарплата'}].map(item=><button type="button" key={item.key} aria-pressed={paymentType===item.key} onClick={()=>{setPaymentType(item.key);setError('');}}>{item.label}</button>)}</div></div>
    <div className="expense-field full"><span id="payment-department-label">Кому выплачиваем</span><div className="payment-segments" role="group" aria-labelledby="payment-department-label">{[{key:'office',label:'Офис'},{key:'drivers',label:'Водители'}].map(item=><button type="button" key={item.key} aria-pressed={department===item.key} onClick={()=>{if(department===item.key)return;setDepartment(item.key);setError('');}}>{item.label}</button>)}</div></div>
    <label className="expense-field full">Отдел<select required={paymentType==='salary' && department==='office'} value={department==='drivers'?school:officeDepartment} onChange={event=>{if(department==='drivers')setSchool(event.target.value);else{setOfficeDepartment(event.target.value);setEmployeeId('');}}}><option value="">{department==='drivers'?'Все школы':'Все отделы'}</option>{department==='drivers'?SCHOOL_TABS.filter(row=>row.key!=='ALL').map(row=><option key={row.key} value={row.key}>{row.label}</option>):EMPLOYEE_DEPARTMENTS.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
    <div className="expense-field full"><span id="payment-recipient-label">Получатели</span>{department==='drivers'?<button type="button" className="payment-recipient-button" aria-labelledby="payment-recipient-label" onClick={()=>setPickerOpen(true)} disabled={driversLoading || Boolean(driversError)}><span>{batch.length?`Выбрано водителей: ${batch.length}`:'Выбрать водителей'}</span><span>Выбрать →</span></button>:<select aria-labelledby="payment-recipient-label" required value={employeeId} onChange={event=>setEmployeeId(event.target.value)} disabled={isLoading}><option value="">Выберите сотрудника</option>{recipients.map(row=><option key={row.id} value={row.id}>{row.fullName}</option>)}</select>}</div>
    <div className="expense-field"><span id="payment-period-label">Периоды выплаты</span><button type="button" className="payment-recipient-button" aria-labelledby="payment-period-label" onClick={()=>setPeriodPickerOpen(true)}><span>{selectedPeriods.length===1?salaryPeriods.find(period=>period.key===selectedPeriods[0])?.label:selectedPeriods.length?`Выбрано периодов: ${selectedPeriods.length}`:'Выберите периоды'}</span><span>▾</span></button></div>
    <label className="expense-field">Сумма, сом<input required={department!=='drivers'} readOnly={department==='drivers' || selectedPeriods.length>1} type="number" min="0.01" step="0.01" value={department==='drivers' || selectedPeriods.length>1?total:amount} onChange={event=>{setAmount(event.target.value);if(selectedPeriods.length===1)setOfficeAmounts(current=>({...current,[selectedPeriods[0]]:event.target.value}));}}/></label>
    <label className="expense-field">Дата выплаты<input required type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
    <label className="expense-field">Способ оплаты<select value={method} onChange={event => setMethod(event.target.value)}><option value="cashless">Безналичные</option><option value="cash">Наличные</option></select></label>
    <label className="expense-field">№ платёжного поручения<input value={number} onChange={event => setNumber(event.target.value)} /></label>
    <label className="expense-field">Комментарий<input value={comment} onChange={event => setComment(event.target.value)} /></label>
    <div className="expense-total-preview"><span>{department==='drivers' ? `К выплате · ${batch.length} водителей` : 'К выплате'}</span><strong>{total.toLocaleString('ru-RU')}</strong></div>
  </fieldset>
    {(error || loadingError) && <p className="expense-form-error" role="alert">{error || 'Не удалось загрузить получателей выплаты'}</p>}
    <button className="expenses-add" type="submit" disabled={busy || !department || loading || Boolean(loadingError)}>{busy ? `Сохранение… ${savedCount}` : savedCount ? 'Повторить оставшиеся выплаты' : paymentType === 'salary' ? 'Выплатить зарплату' : 'Выдать аванс'}</button>
  </form></div>{pickerOpen && <DriverPaymentPicker drivers={activeDrivers} school={school} initial={driverPayments} salary={paymentType==='salary'} periods={salaryPeriods.filter(period=>selectedPeriods.includes(period.key))} transferSchool={transferSchool} onClose={()=>setPickerOpen(false)} onConfirm={rows=>{setDriverPayments(rows);setPickerOpen(false);setError('');}}/>}{periodPickerOpen && <PaymentPeriodPicker periods={salaryPeriods} selected={selectedPeriods} amounts={periodAmounts(selectedPeriods,amount,officeAmounts)} allocate={department==='office'} onClose={()=>setPeriodPickerOpen(false)} onConfirm={(keys,values)=>{setSelectedPeriods(keys);setOfficeAmounts(Object.fromEntries(keys.map((key,index)=>[key,values[key]??(index===0?amount:'')])));if(keys.length===1)setAmount(values[keys[0]]??amount);setDriverPayments(current=>current.map(row=>{const values=periodAmounts(keys,row.amount,row.periodAmounts);return {...row,periodAmounts:values,amount:String(periodTotal(values))};}));setPeriodPickerOpen(false);setError('');}}/>}</div>;
}
