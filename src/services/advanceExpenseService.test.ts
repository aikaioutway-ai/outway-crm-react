import { updateAdvanceExpenseCell } from './advanceExpenseService';
import { ExpenseRecord } from '../modules/costs/expenseTypes';
import { supabase } from './supabase';
const maybeSingle=jest.fn(async()=>({data:{id:'original'},error:null}));
const eq=jest.fn(()=>({select:()=>({maybeSingle})}));
const update=jest.fn(()=>({eq}));
jest.mock('./supabase',()=>({supabase:{from:jest.fn()}}));
beforeEach(()=>{jest.clearAllMocks();(supabase.from as jest.Mock).mockReturnValue({update});});
const row={id:'employee-advance-original',source:'advance',amount:70000,unitPrice:70000,quantity:1} as ExpenseRecord;
test.each([['employee-advance-original','v2_employee_advances'],['advance-original','v2_driver_advances']])('updates original payout %s',async(id,table)=>{
 const saved=await updateAdvanceExpenseCell({...row,id},'amount','75000');
 expect(supabase.from).toHaveBeenCalledWith(table);
 expect(update).toHaveBeenCalledWith({amount:75000});
 expect(eq).toHaveBeenCalledWith('id','original');
 expect(saved.amount).toBe(75000);
});
test('updates only the edited field and rejects invalid amounts',async()=>{
 await updateAdvanceExpenseCell(row,'paymentOrderNumber','1234');
 expect(update).toHaveBeenCalledWith({payment_order_number:'1234'});
 await expect(updateAdvanceExpenseCell(row,'amount','-1')).rejects.toThrow('больше нуля');
 await expect(updateAdvanceExpenseCell(row,'category','personal')).rejects.toThrow('нельзя');
});
test('reports a missing record rather than claiming success',async()=>{
 maybeSingle.mockResolvedValueOnce({data:null,error:null} as any);
 await expect(updateAdvanceExpenseCell(row,'comment','Комментарий')).rejects.toThrow('не найдена');
});
