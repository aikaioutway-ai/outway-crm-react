import { normalizeReceiptCode, normalizeReceiptOcrResult } from './receiptOcrResult';
test('keeps Optima minute precision and sender last four, drops the shared mbiz code',()=>{
 expect(normalizeReceiptOcrResult({bank:'Optima Bank',amount:6800,date:'2026-10-06',time:'17:39',card_last4:'7985',receipt_code:'mbiz:85582109:33065919'})).toEqual({bank:'Optima Bank',amount:6800,date:'2026-10-06',time:'17:39',card_last4:'7985',receipt_code:null});
});
test('preserves leading zeroes and second precision',()=>{
 expect(normalizeReceiptOcrResult({time:'12:23:47',card_last4:'0176',bank:'Bakai Bank'})).toMatchObject({time:'12:23:47',card_last4:'0176',bank:'Bakai Bank'});
});
test('does not manufacture missing time or accept a full account number',()=>{
 expect(normalizeReceiptOcrResult({time:'25:61',card_last4:'1033820000256673',amount:'bad'})).toMatchObject({time:null,card_last4:null,amount:null,bank:null});
 expect(normalizeReceiptOcrResult({})).toEqual({receipt_code:null,time:null,date:null,card_last4:null,bank:null,amount:null});
});
test('drops invented or truncated QR codes but keeps real ones',()=>{
 expect(normalizeReceiptCode('QR_OsOO_AiKai_Group')).toBeNull();
 expect(normalizeReceiptCode('QR_452')).toBeNull();
 expect(normalizeReceiptCode('QR_45201a1070f-0eb7-7d78-96cb')).toBe('QR_45201a1070f-0eb7-7d78-96cb');
 expect(normalizeReceiptCode('MBIZ_S_c09d9781-19f7-4514-8a04-232ec4df284d')).toBe('MBIZ_S_c09d9781-19f7-4514-8a04-232ec4df284d');
});
test('rebuilds MBANK codes cut by a line break',()=>{
 const full='MBIZ_S_4f3b561f-75e1-4249-b44b-ab181e502fad/QR_452 01a1aa22-5290-7819-8aa0-c8986abd32f6';
 expect(normalizeReceiptCode('MBI Z_S_4f3b561f-75e1-4249 -b44b-ab181e502fad/ QR_452 01a1aa22-5290- 7819-8aa0- c8986abd32f6.')).toBe(full);
 expect(normalizeReceiptCode('QR/ОсОО "АйКай Груп"/2026-11-05 11:15:38/MBIZ_S_4f3b561f-75e1-4249-b44b-ab181e502fad/QR_452 01a1aa22-5290-7819-8aa0-c8986abd32f6.')).toBe(full);
 expect(normalizeReceiptCode('Z_S_4f3b561f-75e1-4249-b44b-ab181e502fad')).toBe('MBIZ_S_4f3b561f-75e1-4249-b44b-ab181e502fad');
 expect(normalizeReceiptCode('IZ_S_4F3B561F-75E1-4249-B44B-AB181E502FAD')).toBe('MBIZ_S_4f3b561f-75e1-4249-b44b-ab181e502fad');
 expect(normalizeReceiptCode('452 01a1aa22-5290-7819-8aa0-c8986abd32f6')).toBe('QR_452 01a1aa22-5290-7819-8aa0-c8986abd32f6');
 expect(normalizeReceiptCode('QR_45201a18b3e-3ca1-730b-bcc5-fb07634aed4c')).toBe('QR_452 01a18b3e-3ca1-730b-bcc5-fb07634aed4c');
});
test('restores dashes the OCR dropped inside an ID',()=>{
 expect(normalizeReceiptCode('QR_45201a0c30a-8b68-7966-996bb8f631d16140')).toBe('QR_452 01a0c30a-8b68-7966-996b-b8f631d16140');
 expect(normalizeReceiptCode('MBIZ_S_eed7187ddf29-410c-8aac170bb13b6591')).toBe('MBIZ_S_eed7187d-df29-410c-8aac-170bb13b6591');
 expect(normalizeReceiptCode('01a115b1-5384-7ebe-b2bb58af12c6d084')).toBe('01a115b1-5384-7ebe-b2bb-58af12c6d084');
 expect(normalizeReceiptCode('QR_45201a06c26-9d90-777e-a8ec')).toBe('QR_45201a06c26-9d90-777e-a8ec');
 expect(normalizeReceiptCode('9a462460d41c9579a31269c785079aae')).toBe('9a462460d41c9579a31269c785079aae');
});
test('keeps the sender bank operation ID that the statement shows',()=>{
 expect(normalizeReceiptCode('ELQR ID: 8b8f011b-2b56-447c-9dc5-a11262044d9d')).toBe('8b8f011b-2b56-447c-9dc5-a11262044d9d');
 expect(normalizeReceiptCode('b5f13f5e-38e9-49a3-93 dc-bf3ee12187a2')).toBe('b5f13f5e-38e9-49a3-93dc-bf3ee12187a2');
});
test('keeps bank receipt numbers but drops shared QR codes, account, card digits and names',()=>{
 expect(normalizeReceiptCode('86268116')).toBe('86268116');
 expect(normalizeReceiptCode('ELQR261103/78922/854')).toBe('ELQR261103/78922/854');
 expect(normalizeReceiptCode('QT125737822')).toBe('QT125737822');
 expect(normalizeReceiptCode('85582109:33065919')).toBeNull();
 expect(normalizeReceiptCode('mbiz:25655349:55036015')).toBeNull();
 expect(normalizeReceiptCode('Платеж по QR: ОсОО АйКай Груп - mbiz:85582109:33065919')).toBeNull();
 expect(normalizeReceiptCode('1033820000256673, OsOOAiKaiGrup-mbiz:85582109:33065919')).toBeNull();
 expect(normalizeReceiptCode('OsOO АйКай Груп')).toBeNull();
 expect(normalizeReceiptCode('3177')).toBeNull();
});
