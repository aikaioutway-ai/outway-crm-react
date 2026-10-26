import { EmployeeCardModal } from '../employees/EmployeesPage';
import NotionSelect from '../../core/selects/NotionSelect';
import { createPortal } from 'react-dom';
import type { Employee, EmployeeRole } from '../../types';
import PaymentPeriodPicker from './PaymentPeriodPicker';
import { periodAmounts, periodTotal } from './paymentPeriods';
import DriverPaymentPicker, { DriverPayment } from './DriverPaymentPicker';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_KEYS, ExpenseCategory, ExpenseRecord } from './expenseTypes';
import { updateAdvanceExpense } from '../../services/advanceExpenseService';
import { createExpense, deleteExpense, updateExpense } from '../../services/expenseService';
import { currentSchoolYear, salaryExpensePeriods } from './salaryExpensePeriods';
import { EMPLOYEE_DEPARTMENTS } from '../employees/employeeDepartments';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useDriversTable, useEmployees } from '../../hooks/useCrmQueries';
import { createEmployeeAdvance, deleteEmployeeAdvance } from '../../services/employeeService';
import { createV2DriverAdvance, deleteV2DriverAdvance } from '../../services/crmV2Service';
import { queryClient, QK } from '../../services/queryClient';
import { getBranchFilter, SCHOOL_TABS } from '../families/constants';

export default function EmployeeAdvanceModal({ onClose, onSaved, sessionToken, expense, initialPaymentType='advance', initialScope='office', initialAmount='', onRecordSaved, initialCategory='school', allowPersonalCategory=false, userName }: { onClose: () => void; onSaved: () => void; sessionToken?: string; expense?:ExpenseRecord; initialPaymentType?:'expense'|'advance'|'salary'; initialScope?:'office'|'drivers'; initialAmount?:string; onRecordSaved?:(row:ExpenseRecord)=>void; initialCategory?:ExpenseCategory; allowPersonalCategory?:boolean; userName?:string }) {
  const { data: employees = [], isLoading, error: loadError } = useEmployees();
  const { data: drivers = [], isLoading: driversLoading, error: driversError } = useDriversTable();
  const [paymentType, setPaymentType] = useState<string>(expense ? expense.source==='advance' || expense.subcategory==='Аванс'?'advance':expense.subcategory==='ЗП'?'salary':'expense' : initialPaymentType);
  const [category,setCategory]=useState<ExpenseCategory>(expense?.category ?? initialCategory);
  const [subcategory,setSubcategory]=useState(expense?.subcategory ?? EXPENSE_CATEGORIES[initialCategory].subcategories.find(item=>item!=='ЗП')!);
  const [name,setName]=useState(expense?.name ?? '');
  const [quantity,setQuantity]=useState(expense ? String(expense.quantity ?? 1) : '1');
  const [officeDepartment, setOfficeDepartment] = useState(expense?.departmentKey ?? '');
  const [selectedPeriods,setSelectedPeriods]=useState<string[]>(expense ? [expense.salaryPeriodKey || `${expense.expenseDate.slice(0,7)}-${Number(expense.expenseDate.slice(8,10))<=15?1:2}`] : []);
  const [officeAmounts,setOfficeAmounts]=useState<Record<string,string>>({});
  const [periodPickerOpen,setPeriodPickerOpen]=useState(false);
  const salaryPeriods = salaryExpensePeriods(currentSchoolYear());
  const [creatingEmployee,setCreatingEmployee]=useState(false);
  const [pickerOpen,setPickerOpen]=useState(false);
  const [driverPayments, setDriverPayments] = useState<DriverPayment[]>(expense?.driverId ? [{driverId:expense.driverId,transferId:expense.transferId ?? '',schoolKey:expense.schoolKey ?? '',name:expense.name.replace(/^(ЗП|Аванс) — /,''),amount:String(expense.amount)}] : []);
  useEffect(()=>{
    if (!expense?.driverId || !expense.transferId || !drivers.length) return;
    const driver=drivers.find(item=>item.driverId===expense.driverId);
    if (driver && !driver.transfers.some(transfer=>transfer.id===expense.transferId)) {
      setDriverPayments(current=>current.map(row=>row.driverId===expense.driverId?{...row,temporary:true}:row));
    }
  },[drivers,expense]);
  const [savedCount, setSavedCount] = useState(0);
  const completed = useRef(new Set<string>());
  const inFlight = useRef(false);
  const [department, setDepartment] = useState<string>(expense ? expense.category==='school'?'drivers':'office' : initialScope);
  const [school, setSchool] = useState(expense?.schoolKey ?? '');
  const [employeeId, setEmployeeId] = useState(expense?.employeeId ?? '');
  const [date, setDate] = useState(() => expense?.expenseDate ?? new Date().toLocaleDateString('sv-SE'));
  const [amount, setAmount] = useState(expense ? String(expense.subcategory==='ЗП' || expense.source==='advance' ? expense.amount : expense.unitPrice ?? expense.amount) : initialAmount);
  const [method, setMethod] = useState(expense?.paymentMethod ?? 'cashless');
  const [number, setNumber] = useState(expense?.paymentOrderNumber ?? '');
  const [comment, setComment] = useState(expense?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recipients = employees.filter(employee => employee.role !== 'driver' && (!officeDepartment || EMPLOYEE_DEPARTMENTS.find(item => item.key === officeDepartment)?.roles.includes(employee.role)));
  const activeDrivers = drivers.filter(driver => (driver.status === 'active' || driver.driverId===expense?.driverId));
  const transferSchool = (transfer: typeof drivers[number]['transfers'][number]) => SCHOOL_TABS.find(tab => tab.key !== 'ALL' && (tab.key === transfer.branchShort || tab.label === transfer.branchShort))?.key ?? getBranchFilter(transfer.branchShort, transfer.branchCode);
  const loading = department === 'drivers' ? driversLoading : isLoading;
  const loadingError = department === 'drivers' ? driversError : loadError;
  const batch = driverPayments;
  const total = paymentType==='expense' ? (Number(amount)||0)*(Number(quantity)||0) : department === 'drivers' ? batch.reduce((sum,row)=>sum+(selectedPeriods.length?periodTotal(periodAmounts(selectedPeriods,row.amount,row.periodAmounts)):Number(row.amount)||0),0) : selectedPeriods.length>1?periodTotal(periodAmounts(selectedPeriods,amount,officeAmounts)):Number(amount)||0;
  const overlayOpen=pickerOpen || periodPickerOpen || creatingEmployee;
  const mainDialog=useRef<HTMLDivElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;mainDialog.current?.focus();return()=>previous?.focus();},[]);
  const close=()=>{if(!busy && !overlayOpen)onClose();};
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    if(paymentType==='expense'){
      if(!name.trim() || !Number.isFinite(total) || total<=0 || Number(quantity)<=0 || !date || !EXPENSE_CATEGORIES[category].subcategories.includes(subcategory) || category==='personal' && !allowPersonalCategory){setError('Заполните наименование, категорию, цену, количество и дату');return;}
      inFlight.current=true;setBusy(true);setError('');
      try{
        const payload={name,category,subcategory,unitPrice:Number(amount),quantity:Number(quantity),expenseDate:date,paymentMethod:method==='cash'?'cash' as const:'cashless' as const,paymentOrderNumber:number,comment,createdBy:userName};
        const saved=expense?await updateExpense(expense.id,payload,sessionToken):await createExpense(payload,sessionToken);
        onRecordSaved?.({...saved,source:'manual'});onSaved();onClose();
      }catch(reason){setError(reason instanceof Error?reason.message:'Не удалось сохранить расход');}
      finally{inFlight.current=false;setBusy(false);}
      return;
    }
    const validAmount=(value:string)=>Number.isFinite(Number(value)) && Number(value)>0;
    if(expense && (selectedPeriods.length!==1 || department==='drivers' && batch.length!==1)){setError('При редактировании выберите одного получателя и один период');return;}
    if(!selectedPeriods.length || selectedPeriods.some(key=>!salaryPeriods.some(period=>period.key===key))){setError('Выберите периоды выплаты');return;}
    if(!department || !date || (department==='drivers'
      ? !batch.length || batch.some(row=>Object.values(periodAmounts(selectedPeriods,row.amount,row.periodAmounts)).some(value=>!validAmount(value)) || !(row.temporary ? drivers.some(driver=>driver.driverId===row.driverId) && activeDrivers.some(driver=>driver.transfers.some(transfer=>transfer.id===row.transferId && transferSchool(transfer)===row.schoolKey)) : activeDrivers.some(driver=>driver.driverId===row.driverId && (!driver.transfers.length || driver.transfers.some(transfer=>transfer.id===row.transferId && transferSchool(transfer)===row.schoolKey)))))
      : !recipients.some(row=>row.id===employeeId) || Object.values(periodAmounts(selectedPeriods,amount,selectedPeriods.length>1?officeAmounts:undefined)).some(value=>!validAmount(value)))){setError('Выберите получателей и укажите сумму за каждый период');return;}
    if(paymentType==='salary' && (department==='drivers'?batch.some(row=>!row.schoolKey || !row.transferId):!officeDepartment)){setError('Выберите школу с трансфером или отдел');return;}
    const units=department==='drivers'?batch.map(row=>({id:row.driverId,temporaryDriver:row.temporary,name:row.name,schoolKey:row.schoolKey,transferId:row.transferId,amounts:periodAmounts(selectedPeriods,row.amount,row.periodAmounts)})):[{id:employeeId,temporaryDriver:false,name:recipients.find(row=>row.id===employeeId)?.fullName??'',schoolKey:'OFFICE',transferId:'',amounts:periodAmounts(selectedPeriods,amount,selectedPeriods.length>1?officeAmounts:undefined)}];
    const paymentCount=units.length*selectedPeriods.length;
    inFlight.current=true;setBusy(true);setError('');
    try {
      if(expense && paymentType==='advance' && expense.source!=='advance'){
        // Обычный расход, переделанный в аванс, становится настоящим авансом: только так он
        // привязан к водителю/сотруднику, виден в его карточке и уменьшает остаток к выплате.
        const unit=units[0],key=selectedPeriods[0];
        const [year,month]=key.split('-').map(Number);
        const paymentAmount=Number(unit.amounts[key]);
        const removeCreated=department==='drivers'
          ? await createV2DriverAdvance({driverId:unit.id,transferId:unit.transferId||undefined,schoolKey:unit.schoolKey||undefined,amount:paymentAmount,date,comment,periodMonth:month,periodYear:year,salaryPeriodKey:key,paymentMethod:method,paymentOrderNumber:number}).then(id=>()=>deleteV2DriverAdvance(id))
          : await createEmployeeAdvance(unit.id,paymentAmount,date,comment,{periodMonth:month,periodYear:year,schoolKey:'OFFICE',salaryPeriodKey:key,paymentMethod:method,paymentOrderNumber:number}).then(created=>()=>deleteEmployeeAdvance(created.id));
        try{await deleteExpense(expense.id,sessionToken);}
        catch(reason){await removeCreated().catch(()=>undefined);throw reason;}
      }else if(expense){
        const unit=units[0],key=selectedPeriods[0];
        const paymentAmount=Number(unit.amounts[key]);
        const next={...expense,temporaryDriver:unit.temporaryDriver,category:department==='drivers'?'school' as const:'office' as const,subcategory:paymentType==='salary'?'ЗП':'Аванс',name:`${paymentType==='salary'?'ЗП':'Аванс'} — ${unit.name}`,amount:paymentAmount,unitPrice:paymentAmount,quantity:1,expenseDate:date,paymentMethod:method==='cash'?'cash' as const:'cashless' as const,paymentOrderNumber:number,comment,salaryPeriodKey:key,schoolKey:department==='drivers'?unit.schoolKey:undefined,departmentKey:department==='office'?officeDepartment:undefined,employeeId:paymentType==='salary' && department==='office'?unit.id:undefined,driverId:paymentType==='salary' && department==='drivers'?unit.id:undefined,transferId:paymentType==='salary' && department==='drivers'?unit.transferId:undefined};
        const saved=expense.source==='advance'?await updateAdvanceExpense(expense,{...next,employeeId:department==='office'?unit.id:undefined,driverId:department==='drivers'?unit.id:undefined,transferId:department==='drivers'?unit.transferId:undefined}):await updateExpense(expense.id,next,sessionToken);
        onRecordSaved?.({...saved,source:expense.source ?? 'manual'});
      }else{
      for(const unit of units){
        for(const key of selectedPeriods){
          const completionKey=`${department}:${unit.id}:${unit.transferId}:${key}`;
          if(completed.current.has(completionKey))continue;
          const [year,month]=key.split('-').map(Number);
          const paymentAmount=Number(unit.amounts[key]);
          if(paymentType==='salary'){
            await createExpense({temporaryDriver:unit.temporaryDriver,name:`ЗП — ${unit.name}`,category:department==='drivers'?'school':'office',subcategory:'ЗП',schoolKey:department==='drivers'?unit.schoolKey:undefined,departmentKey:department==='office'?officeDepartment:undefined,salaryPeriodKey:key,driverId:department==='drivers'?unit.id:undefined,employeeId:department==='office'?unit.id:undefined,transferId:department==='drivers'?unit.transferId:undefined,unitPrice:paymentAmount,quantity:1,expenseDate:date,paymentMethod:method==='cash'?'cash':'cashless',paymentOrderNumber:number,comment},sessionToken);
          }else if(department==='drivers'){
            await createV2DriverAdvance({driverId:unit.id,transferId:unit.transferId||undefined,schoolKey:unit.schoolKey||undefined,amount:paymentAmount,date,comment,periodMonth:month,periodYear:year,salaryPeriodKey:key,paymentMethod:method,paymentOrderNumber:number});
          }else{
            await createEmployeeAdvance(unit.id,paymentAmount,date,comment,{periodMonth:month,periodYear:year,schoolKey:'OFFICE',salaryPeriodKey:key,paymentMethod:method,paymentOrderNumber:number});
          }
          completed.current.add(completionKey);setSavedCount(completed.current.size);
        }
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
  return <div className="expense-modal-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)close();}} onKeyDown={event=>{
    if(event.key==='Escape' && !overlayOpen){event.stopPropagation();close();}
    if(event.key==='Tab' && !overlayOpen && mainDialog.current){const nodes=Array.from(mainDialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)'));const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey && (document.activeElement===first || document.activeElement===mainDialog.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}}
  }}><div ref={mainDialog} tabIndex={-1} className="expense-modal payment-main-modal" role="dialog" aria-modal={!overlayOpen} aria-hidden={overlayOpen || undefined} inert={overlayOpen} aria-label={expense ? paymentType==='expense'?'Редактирование расхода':'Редактирование выплаты' : paymentType==='expense'?'Новый расход':'Новая выплата'}><div className="expense-modal-head"><h2>{expense ? 'Редактировать операцию' : 'Новая операция'}</h2><button className="expense-modal-close" disabled={busy} onClick={close} aria-label="Закрыть"><X size={18} /></button></div><form onSubmit={save} className="expense-form"><fieldset disabled={busy || savedCount > 0} style={{ display: 'contents' }}>
    <div className="expense-field full"><span id="payment-type-label">Тип операции</span><div className="payment-segments" role="group" aria-labelledby="payment-type-label">{[{key:'expense',label:'Расход'},{key:'salary',label:'Зарплата'},{key:'advance',label:'Аванс'}].map(item=><button type="button" key={item.key} disabled={expense?.source==='advance' && item.key!=='advance'} aria-pressed={paymentType===item.key} onClick={()=>{if(item.key==='expense' && ['ЗП','Аванс'].includes(subcategory))setSubcategory(EXPENSE_CATEGORIES[category].subcategories.find(value=>!['ЗП','Аванс'].includes(value))!);if(paymentType==='expense' && item.key!=='expense')setDepartment(category==='school'?'drivers':'office');setPaymentType(item.key);setError('');}}>{item.label}</button>)}</div></div>
    {paymentType==='expense' ? <>
      <label className="expense-field full">Наименование расхода<input autoFocus required placeholder="Например, аренда офиса" value={name} onChange={event=>setName(event.target.value)}/></label>
      <label className="expense-field">Главная категория<select value={category} onChange={event=>{const next=event.target.value as ExpenseCategory;setCategory(next);setSubcategory(EXPENSE_CATEGORIES[next].subcategories.find(item=>item!=='ЗП')!);}}>{EXPENSE_CATEGORY_KEYS.filter(key=>allowPersonalCategory || key!=='personal').map(key=><option key={key} value={key}>{EXPENSE_CATEGORIES[key].label}</option>)}</select></label>
      <label className="expense-field">Подкатегория<select value={subcategory} onChange={event=>{setSubcategory(event.target.value);if(['ЗП','Аванс'].includes(event.target.value)){setPaymentType(event.target.value==='ЗП'?'salary':'advance');setDepartment(category==='school'?'drivers':'office');}}}>{EXPENSE_CATEGORIES[category].subcategories.map(item=><option key={item}>{item}</option>)}</select></label>
      <label className="expense-field">Цена, сом<input required type="number" min="0.01" step="0.01" placeholder="0" value={amount} onChange={event=>setAmount(event.target.value)}/></label>
      <label className="expense-field">Количество<input required type="number" min="0.01" step="0.01" value={quantity} onChange={event=>setQuantity(event.target.value)}/></label>
    </> : <>
    <div className="expense-field full"><span id="payment-department-label">Кому выплачиваем</span><div className="payment-segments" role="group" aria-labelledby="payment-department-label">{[{key:'office',label:'Офис'},{key:'drivers',label:'Водители'}].map(item=><button type="button" key={item.key} disabled={expense?.source==='advance' && item.key!==(expense.recipientType==='driver' || expense.driverId?'drivers':'office')} aria-pressed={department===item.key} onClick={()=>{if(department===item.key)return;setDepartment(item.key);setError('');}}>{item.label}</button>)}</div></div>
    <label className="expense-field full">{department==='drivers'?'Школа':'Отдел'}<select required={paymentType==='salary' && department==='office'} value={department==='drivers'?school:officeDepartment} onChange={event=>{if(department==='drivers')setSchool(event.target.value);else{setOfficeDepartment(event.target.value);setEmployeeId('');}}}><option value="">{department==='drivers'?'Все школы':'Все отделы'}</option>{department==='drivers'?SCHOOL_TABS.filter(row=>row.key!=='ALL').map(row=><option key={row.key} value={row.key}>{row.label}</option>):EMPLOYEE_DEPARTMENTS.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
    <div className="expense-field full payment-office-recipient"><span id="payment-recipient-label">Получатели</span>{department==='drivers'?<button type="button" className="payment-recipient-button" aria-labelledby="payment-recipient-label" onClick={()=>setPickerOpen(true)} disabled={driversLoading || Boolean(driversError)}><span>{batch.length?`Выбрано водителей: ${batch.length}`:'Выбрать водителей'}</span><span>Выбрать →</span></button>:<NotionSelect ariaLabel="Получатели" searchable searchPlaceholder="Поиск сотрудника" value={employeeId} options={recipients.map(row=>({value:row.id,label:row.fullName}))} onChange={setEmployeeId} disabled={isLoading} placeholder="Выберите сотрудника" footerAction={{label:'Добавить нового',onClick:()=>setCreatingEmployee(true)}}/>}</div>
    <div className="expense-field"><span id="payment-period-label">Периоды выплаты</span><button type="button" className="payment-recipient-button" aria-labelledby="payment-period-label" onClick={()=>setPeriodPickerOpen(true)}><span>{selectedPeriods.length===1?salaryPeriods.find(period=>period.key===selectedPeriods[0])?.label:selectedPeriods.length?`Выбрано периодов: ${selectedPeriods.length}`:'Выберите периоды'}</span><span>▾</span></button></div>
    <label className="expense-field">Сумма, сом<input required={department!=='drivers'} readOnly={department==='drivers' || selectedPeriods.length>1} type="number" min="0.01" step="0.01" value={department==='drivers' || selectedPeriods.length>1?total:amount} onChange={event=>{setAmount(event.target.value);if(selectedPeriods.length===1)setOfficeAmounts(current=>({...current,[selectedPeriods[0]]:event.target.value}));}}/></label>
    </>}
    <label className="expense-field">{paymentType==='expense'?'Дата расхода':'Дата выплаты'}<input required type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
    <label className="expense-field">Способ оплаты<select value={method} onChange={event => setMethod(event.target.value as 'cash'|'cashless')}><option value="cashless">Безналичные</option><option value="cash">Наличные</option></select></label>
    <label className="expense-field">№ платёжного поручения<input value={number} onChange={event => setNumber(event.target.value)} /></label>
    <label className="expense-field">Комментарий<input value={comment} onChange={event => setComment(event.target.value)} /></label>
    <div className="expense-total-preview"><span>{paymentType==='expense'?'Итого':department==='drivers' ? `К выплате · ${batch.length} водителей` : 'К выплате'}</span><strong>{total.toLocaleString('ru-RU')}</strong></div>
  </fieldset>
    {(error || paymentType!=='expense' && loadingError) && <p className="expense-form-error" role="alert">{error || 'Не удалось загрузить получателей выплаты'}</p>}
    <button className="expenses-add" type="submit" disabled={busy || paymentType!=='expense' && (!department || loading || Boolean(loadingError))}>{busy ? `Сохранение… ${savedCount}` : savedCount ? 'Повторить оставшиеся выплаты' : expense ? 'Сохранить изменения' : paymentType==='expense'?'Добавить расход':paymentType === 'salary' ? 'Выплатить зарплату' : 'Выдать аванс'}</button>
  </form></div>{pickerOpen && <DriverPaymentPicker sessionToken={sessionToken} drivers={activeDrivers} allDrivers={drivers} school={school} initial={driverPayments} salary={paymentType==='salary'} periods={salaryPeriods.filter(period=>selectedPeriods.includes(period.key))} transferSchool={transferSchool} onClose={()=>setPickerOpen(false)} onConfirm={rows=>{setDriverPayments(rows);setPickerOpen(false);setError('');}}/>}{periodPickerOpen && <PaymentPeriodPicker periods={salaryPeriods} selected={selectedPeriods} amounts={periodAmounts(selectedPeriods,amount,officeAmounts)} allocate={department==='office'} onClose={()=>setPeriodPickerOpen(false)} onConfirm={(keys,values)=>{setSelectedPeriods(keys);setOfficeAmounts(Object.fromEntries(keys.map((key,index)=>[key,values[key]??(index===0?amount:'')])));if(keys.length===1)setAmount(values[keys[0]]??amount);setDriverPayments(current=>current.map(row=>{const values=periodAmounts(keys,row.amount,row.periodAmounts);return {...row,periodAmounts:values,amount:String(periodTotal(values))};}));setPeriodPickerOpen(false);setError('');}}/>}{creatingEmployee && createPortal(<EmployeeCardModal employee={null} paymentRecipientOnly restrictedRole={(EMPLOYEE_DEPARTMENTS.find(item=>item.key===officeDepartment)?.roles.filter(role=>role!=='driver') ?? ['manager','b2b_manager','logist','senior_logist','b2b_logist','cashier']) as EmployeeRole[]} sessionToken={sessionToken} onClose={()=>setCreatingEmployee(false)} onDeleted={()=>setCreatingEmployee(false)} onChanged={employee=>{queryClient.setQueryData<Employee[]>(QK.employees,(current:Employee[]|undefined)=>[...(current??[]).filter(item=>item.id!==employee.id),employee]);setEmployeeId(employee.id);setCreatingEmployee(false);}}/>,document.body)}</div>;
}
