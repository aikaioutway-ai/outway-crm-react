import { SCHOOL_TABS } from '../task-api/schools.ts';
import { taskReadScope } from '../task-api/access.ts';
export interface CellTarget { table:string;row:string;column:string;context:string }
export const targetKey=(t:CellTarget)=>JSON.stringify([t.table,t.row,t.column,t.context]);
export function validateTarget(raw:any):CellTarget {
  if(!raw || typeof raw!=='object')throw new Error('Не выбрана ячейка');
  const target={} as CellTarget;
  for(const [key,limit] of [['table',160],['row',500],['column',200],['context',500]] as const){
    if(typeof raw[key]!=='string' || raw[key].length>limit || (key!=='context'&&!raw[key]) || /[\u0000-\u001f]/.test(raw[key]))throw new Error('Некорректная ячейка');
    target[key]=raw[key];
  }
  return target;
}
const executives=['admin','gen_director'];
const leadership=[...executives,'director'];
const finance=[...executives,'cashier'];
const logistics=[...leadership,'logist','senior_logist','b2b_logist'];
const management=[...leadership,'manager','cashier'];
const b2b=[...executives,'senior_logist','cashier','b2b_manager','b2b_logist'];
const catalog=new Set(SCHOOL_TABS.map(s=>s.key));
const check=(result:any)=>{if(result.error?.code==='22P02')return null;if(result.error)throw result.error;return result.data;};
function schoolKey(branch:any):string {
  if(Array.isArray(branch))branch=branch[0];
  return SCHOOL_TABS.find(s=>s.key===branch?.short_name || s.label===branch?.short_name || s.branches.includes(branch?.name))?.key || SCHOOL_TABS.find(s=>s.codes.includes(branch?.code))?.key || '';
}
function permitsSchool(employee:any,key:string):boolean {
  const allowed=employee.school_keys??[];
  return leadership.includes(employee.role) || !allowed.length || allowed.includes('ALL') || Boolean(key && allowed.some((value:string)=>value.toUpperCase()===key.toUpperCase()));
}
async function familyAllowed(db:any,employee:any,id:string){
  const family=check(await db.from('v2_families').select('id').eq('id',id).maybeSingle());if(!family)return false;
  const children=check(await db.from('v2_children').select('v2_school_branches(code,short_name,name)').eq('family_id',id))??[];
  const keys=children.map((child:any)=>schoolKey(child.v2_school_branches));
  // A family card exposes all its children; require access to every represented school.
  return keys.length?keys.every((key:string)=>permitsSchool(employee,key)):permitsSchool(employee,'');
}
async function childAllowed(db:any,employee:any,id:string){
  if(id.endsWith('_empty'))return familyAllowed(db,employee,id.slice(0,-6));
  const row=check(await db.from('v2_children').select('id,v2_school_branches(code,short_name,name)').eq('id',id).maybeSingle());
  return Boolean(row && permitsSchool(employee,schoolKey(row.v2_school_branches)));
}
async function driverAllowed(db:any,employee:any,id:string){
  const row=check(await db.from('v2_drivers').select('id').eq('id',id).maybeSingle());if(!row)return false;
  const transfers=check(await db.from('v2_transfers').select('v2_school_branches(code,short_name,name)').eq('driver_id',id))??[];
  return transfers.length?transfers.every((t:any)=>permitsSchool(employee,schoolKey(t.v2_school_branches))):permitsSchool(employee,'');
}
async function employeeAllowed(db:any,employee:any,id:string){
  const row=check(await db.from('v2_employees').select('id,role').eq('id',id).maybeSingle());
  if(!row)return false;
  return executives.includes(employee.role) || employee.role==='director' && row.role==='manager' || employee.role==='senior_logist' && ['logist','b2b_manager','b2b_logist','cashier'].includes(row.role);
}
const nativeScopes = new Set(["b2b/B2BCashflow:0", "b2b/B2BCashflow:1", "b2b/B2BCashier:0", "b2b/B2BCashier:1", "b2b/B2BCashier:2", "b2b/B2BCashier:3", "b2b/B2BClientDocumentsTab:0", "b2b/B2BClientPaymentsTable:0", "b2b/B2BClients:0", "b2b/B2BClients:1", "b2b/B2BClients:2", "b2b/B2BClients:3", "b2b/B2BExpenses:0", "b2b/B2BFinance:0", "b2b/B2BFinance:1", "b2b/B2BLogistics:0", "b2b/B2BOrders:0", "b2b/B2BOrders:1", "costs/ExpensesModule:0", "costs/SalaryExpensesView:0", "drivers/DriverPaymentsPanel:0", "drivers/DriverPaymentsPanel:1", "drivers/NewDriverModal:0", "employees/EmployeesPage:0", "families/FamiliesPage:0", "families/FamiliesPage:1", "families/FamiliesPage:2", "families/FamiliesPage:3", "families/TabFinance:0", "market/MarketCatalogTab:0", "market/MarketClientsTab:0", "market/MarketOrdersTab:0", "market/MarketOrdersTab:1", "tasks/TaskTeamOverview:0", "tasks/TasksModule:0"]);
const overviewScopes=new Set(['families/ManagerOverview:overview','families/CashierOverview:overview','families/LogisticsOverview:overview','families/DirectorySchoolDashboard:overview','drivers/DriversOverview:overview','employees/EmployeesPage:overview','costs/ExpensesModule:overview','costs/SalaryExpensesView:overview']);
export async function authorizeCell(db:any,employee:any,target:CellTarget):Promise<boolean> {
  const {table,row,column,context}=target;
  const role=employee.role;
  if(table==='drivers_table_by_school')return logistics.includes(role)&&driverAllowed(db,employee,row);
  if(table==='employees_table_v2')return employeeAllowed(db,employee,row);
  if(['cashier_table','payments_table','cashier_refunds_table'].includes(table)){
    if(!management.includes(role))return false;
    const source=table==='cashier_refunds_table'?'v2_refunds':'v2_payments';
    const record=check(await db.from(source).select('family_id').eq('id',row).maybeSingle());
    return Boolean(record && await familyAllowed(db,employee,record.family_id));
  }
  if(/^families_table_(requests_v3|charges_v2|payments_v2|requests|payments|charges|debtors|directory|cashier|logistics|drivers_logistics)$/.test(table)){
    const allowed=table.includes('logistics')?logistics:management;
    return allowed.includes(role)&&childAllowed(db,employee,row);
  }
  if(table==='families/ManagerOverview:accruals')return (employee.id==='emp-admin' || ['gen_director','director'].includes(role)) && permitsSchool(employee,row);
  if(overviewScopes.has(table)){
    const allowed=table.startsWith('costs/')?finance:table.startsWith('employees/')?[...leadership,'senior_logist']:table.includes('Logistics')||table.startsWith('drivers/')?logistics:management;
    if(!allowed.includes(role))return false;
    if(table.startsWith('employees/'))return executives.includes(role) || role==='director' && row==='service' || role==='senior_logist' && ['logistics','service','finance'].includes(row);
    if(table.startsWith('costs/'))return (row!=='personal' && !context.endsWith(':personal')) || executives.includes(role);
    // Aggregates spanning multiple schools are available only to unrestricted employees.
    const school=row.replace(/^school-/, '');
    return catalog.has(school)?permitsSchool(employee,school):permitsSchool(employee,'');
  }
  if(!nativeScopes.has(table))return false;
  if(table.startsWith('costs/')){
    if(!finance.includes(role))return false;
    if(row.startsWith('advance-')||row.startsWith('employee-advance-'))return true;
    const expense=check(await db.from('v2_expenses').select('category').eq('id',row).maybeSingle());
    return Boolean(expense && (expense.category!=='personal'||executives.includes(role)));
  }
  if(table.startsWith('drivers/DriverPaymentsPanel:'))return logistics.includes(role)||finance.includes(role)?driverAllowed(db,employee,context):false;
  if(table==='employees/EmployeesPage:0')return Boolean(context)&&await employeeAllowed(db,employee,context);
  if(table==='families/TabFinance:0')return management.includes(role)&&Boolean(context)&&await familyAllowed(db,employee,context);
  if(table.startsWith('families/FamiliesPage:')){
    if(!logistics.includes(role))return false;
    if(table.endsWith(':0'))return childAllowed(db,employee,row);
    if(table.endsWith(':1')||table.endsWith(':2'))return Boolean(context)&&await driverAllowed(db,employee,context);
    const transfer=check(await db.from('v2_transfers').select('id,v2_school_branches(code,short_name,name)').eq('id',context).maybeSingle());
    return Boolean(transfer&&permitsSchool(employee,schoolKey(transfer.v2_school_branches)));
  }
  if(table.startsWith('b2b/')){
    if(!b2b.includes(role))return false;
    if(role==='b2b_logist')return table==='b2b/B2BLogistics:0';
    if(role==='b2b_manager'){
      if(!['b2b/B2BOrders:0','b2b/B2BClients:0','b2b/B2BClientDocumentsTab:0','b2b/B2BClientPaymentsTable:0'].includes(table))return false;
      if(/водител.*(сум|цен|стоим)|затрат|марж|прибыл|расход/i.test(column))return false;
    }
    return true;
  }
  if(table.startsWith('market/'))return employee.id==='emp-admin'||role==='gen_director';
  if(table==='tasks/TasksModule:0'){
    const task=check(await db.from('v2_tasks').select('creator_id,assignee_id,observer_id,deleted_at').eq('id',row).maybeSingle());
    if(!task||task.deleted_at)return false;
    const scope=taskReadScope(role);
    if(scope.all||[task.creator_id,task.assignee_id,task.observer_id].includes(employee.id))return true;
    if(!scope.roles.length)return false;
    const assignee=check(await db.from('v2_employees').select('role').eq('id',task.assignee_id).maybeSingle());
    return Boolean(assignee && scope.roles.includes(assignee.role));
  }
  if(table==='tasks/TaskTeamOverview:0'){
    const scope=taskReadScope(role);if(scope.all)return true;
    if(!scope.team)return false;
    const teams:Record<string,string[]>= {logistics:['logist','b2b_logist','senior_logist'],management:['manager','b2b_manager'],finance:['cashier'],leadership};
    if(teams[row])return teams[row].some(r=>scope.roles.includes(r));
    const person=check(await db.from('v2_employees').select('role').eq('id',row).maybeSingle());
    return Boolean(person&&scope.roles.includes(person.role));
  }
  return false;
}
