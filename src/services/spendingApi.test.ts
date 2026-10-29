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
function setup(role = 'cashier', previous: object[] = [], status = 'active') {
  let handler: (req: unknown) => Promise<{status:number;body:Record<string,unknown>}>;
  const upsert = jest.fn(async (_rows: Array<{payload: Record<string, unknown>}>, _options?: unknown) => ({error:null}));
  const db = {from:(table:string) => {
    const result = {data:table === 'v2_employees' ? {role,status} : previous,error:null};
    const query: Record<string,unknown> = {then:(resolve:(value:unknown)=>void)=>Promise.resolve(result).then(resolve)};
    for (const method of ['select','eq','is','order','range','neq','gte','lte','in']) query[method]=()=>query;
    query.maybeSingle=async()=>result;
    query.upsert=upsert;
    return query;
  }};
  const source = readFileSync('supabase/functions/spending-api/index.ts','utf8').replace(/^import .*createClient.*;\n/,'');
  runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,{
    Deno:{env:{get:(key:string)=>key === 'SUPABASE_SERVICE_ROLE_KEY' ? secret : 'http://local-test'},serve:(fn:typeof handler)=>{handler=fn;}},
    createClient:()=>db,crypto:webcrypto,TextEncoder,TextDecoder,atob:(value:string)=>Buffer.from(value,'base64').toString('binary'),
    Response:{json:(body:Record<string,unknown>,options:{status?:number})=>({body,status:options.status ?? 200})},
  });
  return {upsert,request:(body:unknown,signedToken=token(role))=>handler({method:'POST',headers:{get:()=>signedToken},json:async()=>body})};
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
