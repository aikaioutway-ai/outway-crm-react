import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { createHmac, webcrypto } from 'crypto';
import { TextEncoder, TextDecoder } from 'util';
import ts from 'typescript';

const secret = 'local-test-signing-key';
const token = (role = 'cashier') => {
  const payload = Buffer.from(JSON.stringify({sub:'test-actor',role,exp:Math.floor(Date.now()/1000)+60})).toString('base64url');
  return `${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`;
};
function setup(role = 'cashier', previous: object[] = [], status = 'active', rpcError: {message:string} | null = null) {
  let handler: (req: unknown) => Promise<{status:number;body:Record<string,unknown>}>;
  const upsert = jest.fn(async (_rows: Array<{payload: Record<string, unknown>}>, _options?: unknown) => ({error:null}));
  const calls: Array<{method:string;args:unknown[]}> = [];
  const rpc = jest.fn(async (_name: string, _args: Record<string, unknown>) => ({data:null,error:rpcError}));
  const db = {rpc,from:(table:string) => {
    const result = {data:table === 'v2_employees' ? {role,status,full_name:'Касса Тест'} : previous,error:null};
    const query: Record<string,unknown> = {then:(resolve:(value:unknown)=>void)=>Promise.resolve(result).then(resolve)};
    for (const method of ['select','eq','is','order','range','neq','gte','lte','in']) query[method]=(...args:unknown[])=>{ calls.push({method,args}); return query; };
    query.maybeSingle=async()=>result;
    query.upsert=upsert;
    query.update=(...args:unknown[])=>{ calls.push({method:'update',args}); return query; };
    return query;
  }};
  const source = readFileSync('supabase/functions/spending-api/index.ts','utf8').replace(/^import .*createClient.*;\n/,'');
  runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,{
    Deno:{env:{get:(key:string)=>key === 'SUPABASE_SERVICE_ROLE_KEY' ? secret : 'http://local-test'},serve:(fn:typeof handler)=>{handler=fn;}},
    createClient:()=>db,crypto:webcrypto,TextEncoder,TextDecoder,atob:(value:string)=>Buffer.from(value,'base64').toString('binary'),
    Response:{json:(body:Record<string,unknown>,options:{status?:number})=>({body,status:options.status ?? 200})},
  });
  return {upsert,rpc,calls,request:(body:unknown,signedToken=token(role))=>handler({method:'POST',headers:{get:()=>signedToken},json:async()=>body})};
}
const entry = {id:'expense',category:'OPEX',subcategory:'Аренда',date:'2026-10-01',amount:100,description:'Аренда',recipient:'',method:'Безналичные'};
test('rejects invalid session signatures', async () => {
  expect((await setup().request({action:'list'},'invalid.signature')).status).toBe(401);
});
test('rejects inactive employees despite a valid signed token', async () => {
  expect((await setup('cashier',[],'inactive').request({action:'list'})).status).toBe(403);
});
test('cashier cannot create personal expenses', async () => {
  const api=setup();
  expect((await api.request({action:'save',rows:[{...entry,category:'Личное'}]})).status).toBe(403);
  expect(api.upsert).not.toHaveBeenCalled();
});
test('cashier cannot overwrite a personal record by changing its category', async () => {
  const api=setup('cashier',[{id:'expense',category:'Личное',payload:entry}]);
  expect((await api.request({action:'save',rows:[entry]})).status).toBe(403);
  expect(api.upsert).not.toHaveBeenCalled();
});
test('deleted copies cannot be recreated by an edit', async () => {
  const api=setup('admin',[{id:'expense',category:'OPEX',payload:entry,deleted_at:'2026-10-29'}]);
  expect((await api.request({action:'save',rows:[entry]})).status).toBe(409);
});
test('saving a copy preserves its provenance and never writes the source', async () => {
  const old={...entry,sourceRef:'v2_expenses:source',originalCategory:'office',originalSubcategory:'Аренда'};
  const api=setup('admin',[{id:'expense',category:'OPEX',payload:old}]);
  expect((await api.request({action:'save',rows:[{...entry,sourceRef:'forged',originalCategory:'personal'}]})).status).toBe(200);
  expect(api.upsert.mock.calls[0][0][0].payload).toMatchObject({sourceRef:old.sourceRef,originalCategory:'office'});
});

test('driver-scoped history is available to logistics without access to employee payments or all expenses', async () => {
  const api = setup('logist');
  const driverId='11111111-1111-1111-1111-111111111111';
  expect((await api.request({action:'payments',driverId})).status).toBe(200);
  expect(api.calls).toContainEqual({method:'eq',args:['payload->>driverId',driverId]});
  expect(api.calls).not.toContainEqual({method:'is',args:['source_table',null]});
  expect(api.calls).toContainEqual({method:'is',args:['deleted_at',null]});
  expect((await api.request({action:'payments',employeeId:'employee'})).status).toBe(403);
  expect((await api.request({action:'list'})).status).toBe(403);
  expect((await api.request({action:'save',rows:[entry]})).status).toBe(403);
});
test('employee history includes only salary and advances for the selected employee', async () => {
  const api=setup('cashier');
  expect((await api.request({action:'payments',employeeId:'employee'})).status).toBe(200);
  expect(api.calls).toContainEqual({method:'eq',args:['payload->>employeeId','employee']});
  expect(api.calls).toContainEqual({method:'is',args:['source_table',null]});
  expect(api.calls).toContainEqual({method:'in',args:['category',['OPEX']]});
  expect(api.calls).toContainEqual({method:'in',args:['payload->>subcategory',['Авансы сотрудникам','Зарплата офиса']]});
});

const refund = {...entry,id:'refund-1',subcategory:'Возврат родителю',familyId:'family-1',recipient:'Ребёнок',description:''};
test('a new parent refund goes through the wallet function, not a plain upsert', async () => {
  const api=setup('cashier');
  expect((await api.request({action:'save',rows:[{...refund,refundId:'forged'}]})).status).toBe(200);
  expect(api.rpc).toHaveBeenCalledWith('v2_spending_refund_save',{p_entry:expect.objectContaining({id:'refund-1',familyId:'family-1'}),p_actor_name:'Касса Тест'});
  expect(api.rpc.mock.calls[0][1].p_entry).not.toHaveProperty('refundId');
  expect(api.upsert).not.toHaveBeenCalled();
});
test('a parent refund without a child is rejected', async () => {
  const api=setup('cashier');
  expect((await api.request({action:'save',rows:[{...refund,familyId:undefined}]})).status).toBe(400);
  expect(api.rpc).not.toHaveBeenCalled();
});
test('editing a linked refund goes through the wallet function', async () => {
  const api=setup('cashier',[{id:'refund-1',category:'OPEX',payload:{...refund,refundId:'r1'}}]);
  expect((await api.request({action:'save',rows:[{...refund,amount:80}]})).status).toBe(200);
  expect(api.rpc).toHaveBeenCalledWith('v2_spending_refund_save',expect.anything());
});
test('a plain expense cannot be turned into a parent refund', async () => {
  const api=setup('cashier',[{id:'refund-1',category:'OPEX',payload:entry}]);
  expect((await api.request({action:'save',rows:[refund]})).status).toBe(400);
  expect(api.rpc).not.toHaveBeenCalled();
  expect(api.upsert).not.toHaveBeenCalled();
});
test('old refunds copied from finance keep saving as plain records', async () => {
  const api=setup('admin',[{id:'refund-1',category:'OPEX',payload:{...refund,sourceRef:'v2_expenses:x'}}]);
  expect((await api.request({action:'save',rows:[{...refund,comment:'новый'}]})).status).toBe(200);
  expect(api.rpc).not.toHaveBeenCalled();
  expect(api.upsert).toHaveBeenCalled();
});
test('refund errors from the database are shown to the user', async () => {
  const api=setup('cashier',[],'active',{message:'REFUND: Клиент не найден'});
  const result=await api.request({action:'save',rows:[refund]});
  expect(result).toMatchObject({status:400,body:{error:'Клиент не найден'}});
});
test('deleting a linked refund returns the money through the wallet function', async () => {
  const api=setup('cashier',{category:'OPEX',payload:{refundId:'r1'}} as unknown as object[]);
  expect((await api.request({action:'delete',id:'refund-1'})).status).toBe(200);
  expect(api.rpc).toHaveBeenCalledWith('v2_spending_refund_delete',{p_entry_id:'refund-1',p_actor_name:'Касса Тест'});
  expect(api.calls.some(call => call.method === 'update')).toBe(false);
});
