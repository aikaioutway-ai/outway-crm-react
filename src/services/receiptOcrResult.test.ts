import { normalizeReceiptOcrResult } from './receiptOcrResult';
test('keeps Optima minute precision, shared mbiz code and sender last four',()=>{
 expect(normalizeReceiptOcrResult({bank:'Optima Bank',amount:6800,date:'2026-10-06',time:'17:39',card_last4:'7985',receipt_code:'mbiz:85582109:33065919'})).toEqual({bank:'Optima Bank',amount:6800,date:'2026-10-06',time:'17:39',card_last4:'7985',receipt_code:'mbiz:85582109:33065919'});
});
test('preserves leading zeroes and second precision',()=>{
 expect(normalizeReceiptOcrResult({time:'12:23:47',card_last4:'0176',bank:'Bakai Bank'})).toMatchObject({time:'12:23:47',card_last4:'0176',bank:'Bakai Bank'});
});
test('does not manufacture missing time or accept a full account number',()=>{
 expect(normalizeReceiptOcrResult({time:'25:61',card_last4:'1033820000256673',amount:'bad'})).toMatchObject({time:null,card_last4:null,amount:null,bank:null});
 expect(normalizeReceiptOcrResult({})).toEqual({receipt_code:null,time:null,date:null,card_last4:null,bank:null,amount:null});
});
