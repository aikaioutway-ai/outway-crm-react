/**
 * @jest-environment node
 */
// Node WebCrypto rejects ArrayBuffers created in the jsdom realm on Node 20 (CI).
import { assertNoReceiptDuplicate, duplicateReceiptMessage } from './receiptDuplicate';
import {supabase} from './supabase';
jest.mock('./supabase',()=>({supabase:{rpc:jest.fn()}}));
beforeEach(()=>jest.clearAllMocks());
test('checks shared mbiz with all details without considering the code unique on the client',async()=>{
 (supabase.rpc as jest.Mock).mockResolvedValue({data:[],error:null});
 await expect(assertNoReceiptDuplicate({code:'mbiz:85582109:33065919',amount:6800,date:'2026-10-06',details:{time:'17:39',cardLast4:'7985',bank:'Optima Bank'}})).resolves.toBeUndefined();
 expect(supabase.rpc).toHaveBeenCalledWith('find_receipt_duplicate',expect.objectContaining({p_code:'mbiz:85582109:33065919',p_time:'17:39',p_card:'7985'}));
});
test('reports the existing family and payment and refuses submission',async()=>{
 const duplicate={payment_id:'id',family_id:'FAM-000249',parent_name:'Перминов Александр',amount:6800,payment_date:'2026-10-08',match_type:'code' as const};
 (supabase.rpc as jest.Mock).mockResolvedValue({data:[duplicate],error:null});
 await expect(assertNoReceiptDuplicate({code:'existing',amount:6800,date:'2026-10-08'})).rejects.toThrow('Перминов Александр');
 expect(duplicateReceiptMessage(duplicate)).toContain('FAM-000249');
});
test('does not silently continue when duplicate checking is unavailable',async()=>{
 (supabase.rpc as jest.Mock).mockResolvedValue({data:null,error:{message:'offline'}});
 await expect(assertNoReceiptDuplicate({hash:'file-hash',amount:6800,date:'2026-10-08'})).rejects.toThrow('Отправка остановлена');
});

test('SHA-256 identifies equal file bytes independently of the filename',async()=>{
 const {receiptFileHash}=await import('./receiptDuplicate');
 const file={arrayBuffer:async()=>new Uint8Array([97,98,99]).buffer} as File;
 expect(await receiptFileHash(file)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 expect(await receiptFileHash(file)).toBe(await receiptFileHash({...file,name:'renamed.jpg'} as File));
});
