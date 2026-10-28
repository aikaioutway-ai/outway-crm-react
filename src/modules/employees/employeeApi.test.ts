/** @jest-environment node */
import fs from 'fs';
import vm from 'vm';
import ts from 'typescript';
import { webcrypto } from 'crypto';
import * as access from '../../../supabase/functions/employee-api/access';

function setup(viewerRole='cashier', previousRole?: string) {
  const insert=jest.fn().mockReturnValue({select:()=>({single:async()=>({data:{id:'new'}})})});
  const update=jest.fn();
  const rows=[{role:viewerRole,status:'active'}, previousRole?{role:previousRole}:null];
  const db={from:jest.fn(()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:rows.shift()})})}),insert,update}))};
  let handler: (req:Request)=>Promise<Response>;
  const source=fs.readFileSync('supabase/functions/employee-api/index.ts','utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const secret='isolated-unit-test-session-key';
  vm.runInNewContext(compiled,{exports:{},require:(name:string)=>name==='./access.ts'?access:{createClient:()=>db},Deno:{env:{get:()=>secret},serve:(fn:typeof handler)=>{handler=fn;}},crypto:webcrypto,TextEncoder,TextDecoder,atob,Response,console});
  return { insert, update, async send(employee:Record<string,unknown>, valid=true) {
    const payload=Buffer.from(JSON.stringify({sub:'viewer',role:viewerRole,exp:Math.floor(Date.now()/1000)+60})).toString('base64url');
    const key=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signature=Buffer.from(await webcrypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))).toString('base64url');
    return handler!(new Request('https://test.invalid',{method:'POST',headers:{'x-employee-session':valid?`${payload}.${signature}`:'invalid'},body:JSON.stringify({action:'saveEmployee',employee})}));
  }};
}
const draft={full_name:'Test',login:'test',role:'manager',status:'active',school_keys:['ALL'],password_hash:'a'.repeat(64)};
test('real handler denies forged sessions without inserting',async()=>{
  const api=setup();expect((await api.send(draft,false)).status).toBe(401);expect(api.insert).not.toHaveBeenCalled();
});
test.each(['admin','gen_director','director','senior_logist'])('cashier cannot submit leadership role %s',async role=>{
  const api=setup();expect((await api.send({...draft,role})).status).toBe(403);expect(api.insert).not.toHaveBeenCalled();
});
test('cashier cannot activate a new account even with crafted payload',async()=>{
  const api=setup();expect((await api.send(draft)).status).toBe(200);expect(api.insert).toHaveBeenCalledWith(expect.objectContaining({role:'manager',status:'inactive'}));
});
test('cashier cannot overwrite existing privileged user',async()=>{
  const api=setup('cashier','gen_director');expect((await api.send({...draft,id:'target'})).status).toBe(403);expect(api.update).not.toHaveBeenCalled();
});
