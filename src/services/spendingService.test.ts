import { fetchSpendingEntries, saveSpendingEntries } from './spendingService';
import { supabase } from './supabase';
import type { SpendingEntry } from '../modules/spending/SpendingModule';
jest.mock('./supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
const invoke = supabase.functions.invoke as jest.Mock;
beforeEach(() => invoke.mockReset());
test('loads every page including the 501st copied expense', async () => {
  invoke.mockResolvedValueOnce({ data: {ok:true, rows:Array.from({length:500},(_,id)=>({id:String(id)}))} })
    .mockResolvedValueOnce({data:{ok:true,rows:[{id:'last'}]}});
  expect(await fetchSpendingEntries('session')).toHaveLength(501);
  expect(invoke.mock.calls[1][1].body.offset).toBe(500);
});
test('saves a batch of payments in one atomic request', async () => {
  invoke.mockResolvedValue({data:{ok:true}});
  await saveSpendingEntries('session', Array.from({length:120},(_,id)=>({id:String(id)} as SpendingEntry)));
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke.mock.calls[0][1].body.rows).toHaveLength(120);
});
test('reports a failed save instead of treating it as success', async () => {
  invoke.mockResolvedValue({data:{ok:false,error:'Нет доступа'}});
  await expect(saveSpendingEntries('session',[{id:'expense'} as SpendingEntry])).rejects.toThrow('Нет доступа');
});
