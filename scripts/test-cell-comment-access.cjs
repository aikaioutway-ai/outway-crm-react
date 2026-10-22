const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
// Run the actual Edge Function authorization module without a Supabase network connection.
function load(file){const exports={};const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;new Function('require','exports',source)(name=>load(path.resolve(path.dirname(file),name)),exports);return exports;}
const {authorizeCell,validateTarget,targetKey}=load(path.resolve('supabase/functions/cell-comments-api/access.ts'));
function db(records){return{from(table){const filters={};const builder={select(){return builder},eq(key,value){filters[key]=value;return builder},maybeSingle:async()=>({data:(records[table]||[]).find(r=>Object.entries(filters).every(([key,value])=>r[key]===value))||null}),then(resolve,reject){return Promise.resolve({data:(records[table]||[]).filter(r=>Object.entries(filters).every(([key,value])=>r[key]===value))}).then(resolve,reject)}};return builder}}}
const database=db({v2_children:[{id:'a',v2_school_branches:{short_name:'TIS',code:'TENSAY'}}],v2_employees:[{id:'manager-a',role:'manager'},{id:'logist-a',role:'logist'},{id:'cashier-a',role:'cashier'}],v2_tasks:[{id:'mine',creator_id:'manager-a',assignee_id:'other',observer_id:null,deleted_at:null},{id:'foreign',creator_id:'other',assignee_id:'cashier-a',observer_id:null,deleted_at:null}]});
const target=(table,row,context='',column='name')=>({table,row,column,context});
(async()=>{
 let checks=0;async function check(expected,employee,selection){assert.equal(await authorizeCell(database,employee,selection),expected);checks++;}
 await check(true,{id:'manager-a',role:'manager',school_keys:['TIS']},target('families_table_requests','a'));
 await check(false,{id:'manager-a',role:'manager',school_keys:['AES']},target('families_table_requests','a'));
 await check(false,{role:'manager'},target('costs/ExpensesModule:overview','office'));
 await check(false,{role:'cashier'},target('costs/ExpensesModule:overview','personal'));
 await check(true,{role:'admin'},target('costs/ExpensesModule:overview','personal'));
 await check(false,{role:'cashier'},target('costs/ExpensesModule:overview','Питание','2026-10:personal'));
 await check(false,{role:'director'},target('employees_table_v2','logist-a'));
 await check(true,{role:'director'},target('employees_table_v2','manager-a'));
 await check(true,{id:'manager-a',role:'manager'},target('tasks/TasksModule:0','mine'));
 await check(false,{id:'manager-a',role:'manager'},target('tasks/TasksModule:0','foreign'));
 await check(false,{id:'manager-a',role:'manager'},target('tasks/TaskTeamOverview:0','finance'));
 await check(false,{role:'b2b_manager'},target('b2b/B2BFinance:0','order'));
 await check(false,{role:'b2b_manager'},target('b2b/B2BClients:1','order'));
 await check(false,{role:'b2b_logist'},target('b2b/B2BExpenses:0','expense'));
 await check(false,{role:'admin'},target('unregistered-table','x'));
 assert.throws(()=>validateTarget({table:'x',row:'y',column:'z',context:'\0'}));
 assert.notEqual(targetKey(target('table','a','2026-10')),targetKey(target('table','a','2026-11')));
 console.log(`${checks+2} cell comment authorization and identity checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1});
