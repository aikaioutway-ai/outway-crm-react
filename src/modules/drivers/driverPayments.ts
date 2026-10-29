export interface DriverPaymentRecord {
  id: string;
  sourceId: string;
  kind: 'advance' | 'salary' | 'payment';
  spendingId?: string;
  date: string;
  amount: number;
  periodKey: string;
  schoolKey?: string;
  paymentMethod?: string;
  paymentOrderNumber?: string;
  comment: string;
  createdAt: string;
}
export function driverPaymentPeriodLabel(key:string) {
  if(!/^\d{4}-\d{2}(-[12])?$/.test(key))return 'Период не указан';
  const [year,month,half]=key.split('-').map(Number);
  const label=new Date(year,month-1,1).toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
  return half?`${label} · ${half===1?'1–15':`16–${new Date(year,month,0).getDate()}`}`:label;
}
export function driverPaymentTotals(rows:DriverPaymentRecord[]) {
  const groups=new Map<string,{key:string;advance:number;salary:number;payment:number;total:number}>();
  for(const row of rows){
    const key=row.periodKey.slice(0,7)||row.date.slice(0,7);
    const group=groups.get(key)??{key,advance:0,salary:0,payment:0,total:0};
    group[row.kind]+=Math.round(row.amount*100);group.total+=Math.round(row.amount*100);groups.set(key,group);
  }
  return Array.from(groups.values()).sort((a,b)=>b.key.localeCompare(a.key)).map(group=>({...group,advance:group.advance/100,salary:group.salary/100,payment:group.payment/100,total:group.total/100}));
}
