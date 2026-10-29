import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import DataTable, { ColumnDef } from '../../core/tables/DataTable';
import { SCHOOL_TABS } from '../families/constants';
import { SPENDING_CATEGORIES, SpendingEntry } from './SpendingModule';
import '../costs/ExpensesModule.css';

type Props = { /** Номер трансфера по его id — для колонки «Трансфер» в COGS. */ transferNumbers?: Record<string, number>; category?: string; showSchoolDetails?: boolean; title?: string; toolbarActions?: React.ReactNode; onBack?: () => void; columnsOpen?: boolean; onColumnsOpenChange?: (open: boolean) => void; rows: SpendingEntry[]; disabled: boolean; onEdit: (row: SpendingEntry) => void; onDelete: (row: SpendingEntry) => void; onSave: (row: SpendingEntry) => Promise<boolean> };
export function editSpendingCell(row: SpendingEntry, key: string, value: unknown): SpendingEntry | null {
  const next = {...row};
  if (['amount','unitPrice','quantity'].includes(key)) {
    const number = Number(String(value).replace(/\s/g,'').replace(',','.'));
    if (!Number.isFinite(number) || number <= 0) return null;
    if (key === 'amount') { next.amount = Math.round(number * 100) / 100; next.unitPrice = next.amount / (next.quantity || 1); }
    else {
      if (key === 'unitPrice') next.unitPrice = number;
      else next.quantity = number;
      next.amount = Math.round((next.unitPrice ?? row.amount / (row.quantity || 1)) * (next.quantity ?? 1) * 100) / 100;
    }
  } else if (key === 'category') {
    if (row.sourceRef || !Object.prototype.hasOwnProperty.call(SPENDING_CATEGORIES, String(value))) return null;
    next.category = String(value) as SpendingEntry['category'];
    next.subcategory = SPENDING_CATEGORIES[next.category][0];
  } else if (key === 'subcategory') {
    if (row.sourceRef || !SPENDING_CATEGORIES[row.category].includes(String(value))) return null;
    next.subcategory = String(value);
  } else if (key === 'date') {
    const date = String(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) return null;
    next.date = date;
  } else if (key === 'method') {
    if (!['Наличные','Безналичные'].includes(String(value))) return null;
    next.method = String(value);
  } else if (key === 'description') {
    if (!String(value).trim()) return null;
    next.description = String(value).trim();
  } else if (key === 'salaryPeriodKey') {
    if (value && !/^\d{4}-(0[1-9]|1[0-2])(-[12])?$/.test(String(value))) return null;
    next.salaryPeriodKey = String(value) || undefined;
  } else if (key === 'comment' || key === 'paymentOrderNumber' || key === 'recipient') next[key] = String(value);
  else return null;
  return Number.isFinite(next.amount) && next.amount > 0 ? next : null;
}
export default function SpendingRecordsTable({rows,disabled,onEdit,onDelete,onSave,columnsOpen,onColumnsOpenChange,title='Все расходы',toolbarActions,onBack,showSchoolDetails=false,category,transferNumbers={}}: Props) {
  // В COGS школа и трансфер — главное: ставим их первыми, а «Категорию» (везде COGS) прячем.
  const cogs = category === 'COGS';
  const schoolLabel = (row: SpendingEntry) => SCHOOL_TABS.find(school=>school.key===row.schoolKey)?.label || row.schoolKey || '—';
  const transferLabel = (row: SpendingEntry) => { const number = row.transferNumber || (row.transferId ? transferNumbers[row.transferId] : 0); return number ? `№${number}` : row.driverId ? 'Резерв' : '—'; };
  // Внутри одной категории колонка «Категория» не нужна — она есть только в «Все».
  const showCategory = !category || category === 'ALL';
  const transferOf = (row: SpendingEntry) => Number(row.transferNumber || (row.transferId ? transferNumbers[row.transferId] : 0)) || 0;
  const schoolOrder = (row: SpendingEntry) => { const index = SCHOOL_TABS.findIndex(school => school.key === row.schoolKey); return index < 0 ? SCHOOL_TABS.length : index; };
  // COGS по умолчанию: по школе (как плитки), внутри — по номеру трансфера (резерв в конце), потом новые выше.
  const ordered = cogs ? [...rows].sort((a, b) => schoolOrder(a) - schoolOrder(b) || (transferOf(a) || Infinity) - (transferOf(b) || Infinity) || b.date.localeCompare(a.date)) : rows;
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const tens = rows.length % 100, ones = rows.length % 10;
  const recordsWord = tens >= 11 && tens <= 14 ? 'записей' : ones === 1 ? 'запись' : ones >= 2 && ones <= 4 ? 'записи' : 'записей';
  // Перед ручным комментарием — школа, трансфер и получатель: видно, кому и откуда выплата.
  const recipientOf = (row: SpendingEntry) => row.recipient?.trim() || row.childName || (row.driverId || row.employeeId ? row.description.split(' — ')[1]?.trim() : '') || '';
  const commentTags = (row: SpendingEntry) => [
    row.schoolKey ? SCHOOL_TABS.find(school => school.key === row.schoolKey)?.label || row.schoolKey : '',
    transferOf(row) ? `№${transferOf(row)}` : '',
    recipientOf(row),
  ].filter(Boolean);
  const cogsColumns: ColumnDef<SpendingEntry>[] = cogs ? [
    {key:'schoolKey',label:'Школа',type:'text',width:100,getValue:schoolLabel,render:(_value,row)=>schoolLabel(row)},
    {key:'transferId',label:'Трансфер',type:'text',width:120,getValue:transferLabel,render:(_value,row)=>transferLabel(row)},
  ] : [];
  const columns: ColumnDef<SpendingEntry>[] = [
    ...cogsColumns,
    {key:'description',label:'Наименование расхода',type:'text',width:230,editable:true,visible:!cogs},
    ...(showSchoolDetails && !cogs ? [{key:'schoolKey',label:'Школа',type:'text' as const,width:100,render:(_value: unknown,row: SpendingEntry)=>SCHOOL_TABS.find(school=>school.key===row.schoolKey)?.label || row.schoolKey || '—'}, {key:'transferNumber',label:'№ трансфера',type:'number' as const,width:115,render:(_value: unknown,row: SpendingEntry)=>row.transferNumber ? String(row.transferNumber) : row.paymentOnly ? 'Резерв' : '—'}] : []),
    ...(!showCategory ? [] : [{key:'category',label:'Категория',type:'select' as const,width:150,editable:false,editOptions:Object.keys(SPENDING_CATEGORIES).map(value=>({value,label:value})),getValue:(row: SpendingEntry)=>row.category}]),
    {key:'subcategory',label:'Подкатегория',type:'select',width:180,editable:false,getValue:row=>row.classificationChanged ? row.subcategory : row.originalSubcategory || row.subcategory,editOptions:Array.from(new Set(Object.values(SPENDING_CATEGORIES).flat())).map(value=>({value,label:value}))},
    {key:'amount',label:'Сумма',type:'currency',width:130,editable:true,render:value=><strong className="finance-amount">{Number(value).toLocaleString('ru-RU',{maximumFractionDigits:2})}</strong>},
    {key:'date',label:'Дата',type:'date',width:130,editable:true,render:value=>String(value).split('-').reverse().join('.')},
    {key:'paymentOrderNumber',label:'№ платёжного поручения',type:'text',width:170,editable:true},
    {key:'comment',label:'Комментарий',type:'text',width:340,editable:true,render:(_value,row)=>{const tags=commentTags(row);return <span className="spending-comment" title={[...tags,row.comment].filter(Boolean).join(' · ')}>{tags.map(tag=><span key={tag} className="spending-comment-tag">{tag}</span>)}{row.comment && <span className="spending-comment-text">{row.comment}</span>}</span>;}},
    {key:'recipient',label:'Получатель',type:'text',width:180,editable:true,visible:false},
    {key:'method',label:'Оплата',type:'select',width:130,editable:true,visible:false,editOptions:[{value:'Наличные',label:'Наличные'},{value:'Безналичные',label:'Безналичные'}]},
    {key:'unitPrice',label:'Цена',type:'currency',width:120,editable:true,visible:false},
    {key:'quantity',label:'Кол-во',type:'number',width:90,editable:true,visible:false},
    {key:'salaryPeriodKey',label:'Период выплаты',type:'text',width:150,editable:true,visible:false},
    ...(!showSchoolDetails && !cogs ? [{key:'schoolKey',label:'Школа',type:'text' as const,width:120,visible:false,render:(_value: unknown,row: SpendingEntry)=>SCHOOL_TABS.find(school=>school.key===row.schoolKey)?.label || row.schoolKey || '—'}] : []),
    {key:'actions',label:'Действия',type:'text',width:100,sortable:false,filterable:false,render:(_value,row)=><div className="expense-row-actions"><button type="button" disabled={disabled} aria-label={`Редактировать ${row.description}`} onClick={()=>onEdit(row)}><Pencil size={14}/></button><button type="button" className="danger" disabled={disabled} aria-label={`Удалить ${row.description}`} onClick={()=>onDelete(row)}><Trash2 size={14}/></button></div>},
  ];
  return <section className="spending-records-table finance-workspace" aria-label="Записи расходов">
    <DataTable<SpendingEntry> showProperties={columnsOpen} onShowPropertiesChange={onColumnsOpenChange} key={cogs ? `cogs:${showSchoolDetails}` : showSchoolDetails ? 'school' : 'category'} storageKey={cogs ? (showSchoolDetails ? 'cashier_spending_cogs_school_records_v1' : 'cashier_spending_cogs_records_v1') : showSchoolDetails ? 'cashier_spending_school_records_v1' : 'cashier_spending_records_v1'} commentTableKey="spending/SpendingRecordsTable:0" columns={columns} data={ordered} rowKey="id" onRowOpen={onEdit} canRowOpen={()=>!disabled} onRowEdit={onEdit} onRowDelete={onDelete} canRowDelete={()=>!disabled} canEditCell={(row,key)=>!disabled && !['category','subcategory','schoolKey','transferNumber'].includes(key) && !(key==='recipient' && (row.driverId || row.employeeId))} onCellSave={(row,key,value)=>{const next=editSpendingCell(row,key,value);return next ? onSave(next) : false;}} canManageProperties={false} toolbarRightExtra={toolbarActions} toolbarExtra={<div className="expenses-table-heading">{onBack && <button type="button" className="expenses-view-button" onClick={onBack}>К сводке</button>}<strong>{title}</strong><span>{rows.length} {recordsWord} на сумму <b>{total.toLocaleString('ru-RU',{maximumFractionDigits:2})} сом</b></span></div>} emptyText="За выбранный период расходов пока нет" />
  </section>;
}
