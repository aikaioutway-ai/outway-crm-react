import { callTaskApi } from './taskService';
import { supabase } from './supabase';
jest.mock('./supabase',()=>({supabase:{functions:{invoke:jest.fn()}}}));
jest.mock('./queryClient',()=>({queryClient:{invalidateQueries:jest.fn()}}));
const invoke=supabase.functions.invoke as jest.Mock;
beforeEach(()=>jest.clearAllMocks());
test('requires signed employee session before making a request',async()=>{
  await expect(callTaskApi(undefined,{action:'list'})).rejects.toThrow('Войдите в CRM');expect(invoke).not.toHaveBeenCalled();
});
test('sends the employee session only in the required header',async()=>{
  invoke.mockResolvedValue({data:{ok:true,rows:[]},error:null});
  await callTaskApi('signed',{action:'list'});
  expect(invoke).toHaveBeenCalledWith('task-api',{body:{action:'list'},headers:{'x-employee-session':'signed'}});
});
test('preserves actionable server validation errors',async()=>{
  invoke.mockResolvedValue({data:{ok:false,error:'Укажите причину переноса срока'},error:null});
  await expect(callTaskApi('signed',{action:'mutate'})).rejects.toThrow('Укажите причину переноса срока');
});
