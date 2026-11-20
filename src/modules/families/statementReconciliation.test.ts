import type { FamilyPayment } from '../../types';
import { mergeStatements, reconcileBankStatement } from './statementReconciliation';

const code = 'MBIZ_S_3a3cbd6f0934-46b8-934de733719f4db2';
const entry = {
  number: 12, document: '№ 1', purpose: '', amount: 11900,
  codes: ['mbiz_s_3a3cbd6f093446b8934de733719f4db2'],
  postingDate: '2026-11-03', operationDate: '2026-11-02', time: '15:29:23',
};
const payment: FamilyPayment = {
  id: 'p1', familyId: 'f1', amount: 11900, paymentDate: '2026-11-02',
  createdAt: '', paymentType: 'transfer', status: 'На проверке',
  receiptCode: code, receiptTime: '15:29', receiptUrl: 'https://example.com/receipt',
};

test('classifies matching codes by amount, including normalized codes', () => {
  expect(reconcileBankStatement([entry], [payment])[0].group).toBe('1');
  expect(reconcileBankStatement([entry], [{ ...payment, amount: 12000 }])[0].group).toBe('2');
});

test('uses amount and date without requiring matching time', () => {
  const [result] = reconcileBankStatement([{ ...entry, codes: [] }], [{ ...payment, receiptTime: '20:00' }]);
  expect(result.group).toBe('2');
  expect(result.candidates).toHaveLength(1);
  expect(reconcileBankStatement([{ ...entry, codes: [], amount: 12000 }], [payment])[0].group).toBe('Х');
});

test('does not suggest a code-matched payment for another statement row', () => {
  expect(reconcileBankStatement([entry, { ...entry, number: 13, codes: [] }], [payment]).map(row => row.group))
    .toEqual(['1', 'Х']);
});

const source = (purpose: string) => [{ label: 'Назначение платежа', value: purpose }];

test('matches receipts by operation ID in both statement formats', () => {
  const mbank = { ...entry, codes: [], source: source('QR/ОсОО "АйКай Груп"/2026-11-05 11:15:38/MBIZ_S_4f3b561f-75e1-4249-b44b-ab181e502fad/QR_452 01a1aa22-5290-7819-8aa0-c8986abd32f6.;ОАО "МБАНК"') };
  const other = { ...entry, number: 13, codes: [], source: source('Покупка по QR (чужие)/Кенжебаева Э. Т./8b8f011b-2b56-447c-9dc5-a11262044d9d/ОсОО "АйКай Груп"/2026-11-02 11:38:22/MBIZ_S_17935979020075627/QR_130 01a19ac4-187c-7de2-92a4-1d151f11ce9a') };
  const [first, second] = reconcileBankStatement([mbank, other], [
    { ...payment, id: 'mbank', receiptCode: 'QR_452 01a1aa22-5290-7819-8aa0-c8986abd32f6' },
    { ...payment, id: 'bakai', receiptCode: '8b8f011b-2b56-447c-9dc5-a11262044d9d' },
  ]);
  expect([first.group, first.candidates[0].id]).toEqual(['1', 'mbank']);
  expect([second.group, second.candidates[0].id]).toEqual(['1', 'bakai']);
});

test('reads IDs from statements saved with the old prefixed codes', () => {
  const saved = { ...entry, codes: ['qr_45201a1aa22529078198aa0c8986abd32f6'] };
  expect(reconcileBankStatement([saved], [{ ...payment, receiptCode: 'QR_452 01a1aa22-5290-7819-8aa0-c8986abd32f6' }])[0].group).toBe('1');
});

test('does not give a receipt to another row with the same amount when its time matches a different row', () => {
  const right = { ...entry, number: 1, codes: [], time: '11:15:38', operationDate: '2026-11-05' };
  const wrong = { ...entry, number: 2, codes: [], time: '16:40:00', operationDate: '2026-11-05' };
  const receipt = { ...payment, paymentDate: '2026-11-05', receiptTime: '11:15', receiptCode: undefined };
  expect(reconcileBankStatement([wrong, right], [receipt]).map(row => [row.group, row.candidates.length]))
    .toEqual([['Х', 0], ['2', 1]]);
});

test('keeps a confirmed payment on its row when the cashier set the posting date', () => {
  const confirmed = { ...payment, receiptCode: undefined, status: 'Подтверждено' as const, actualPaymentDate: '2026-11-03' };
  expect(reconcileBankStatement([{ ...entry, codes: [] }], [confirmed])[0].group).toBe('2');
});

test('merges overlapping statements and keeps each bank row once', () => {
  const row = (number: number, document: string) => ({ ...entry, number, document, source: source(`purpose ${document}`) });
  const merged = mergeStatements([{ entries: [row(5, '№ 1'), row(6, '№ 2')] }, { entries: [row(1, '№ 2'), row(2, '№ 3')] }]);
  expect(merged.map(item => [item.number, item.document])).toEqual([[1, '№ 1'], [2, '№ 2'], [3, '№ 3']]);
});

test('puts one receipt attached to several CRM payments into duplicates', () => {
  const [row] = reconcileBankStatement([entry], [payment, { ...payment, id: 'p2', familyId: 'f2' }]);
  expect([row.group, row.candidates.map(item => item.id)]).toEqual(['Д', ['p1', 'p2']]);
});

test('gives each CRM payment to only one statement row with the same amount and date', () => {
  const rows = [1, 2, 3].map(number => ({ ...entry, number, codes: [] }));
  const one = { ...payment, receiptCode: undefined };
  expect(reconcileBankStatement(rows, [one]).map(row => [row.group, row.candidates.map(item => item.id)]))
    .toEqual([['2', [one.id]], ['Х', []], ['Х', []]]);
  const two = [one, { ...one, id: 'p2' }];
  const paired = reconcileBankStatement(rows, two).flatMap(row => row.candidates.map(item => item.id));
  expect(paired.sort()).toEqual([one.id, 'p2'].sort());
});

test.each([false, true])('reads statement headers with rich text = %s', async rich => {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Выписка');
  sheet.getCell('A1').value = 'За период с 09.11.2026 по 15.11.2026';
  const labels = ['Документ', 'Дата операции', '', '', '', '', '', '', 'Оборот Дт', 'Оборот Кт', 'Назначение платежа'];
  labels.forEach((text, index) => {
    sheet.getRow(3).getCell(index + 1).value = rich ? { richText: [{ text }] } : text;
  });
  sheet.getRow(4).values = ['Плат.пор. № 1', '09.11.2026', '', '', '', '', '', '', 0, 5200, 'Оплата'];
  sheet.getRow(5).values = ['Плат.пор. № 2', '09.11.2026', '', '', '', '', '', '', 52, 0, 'Комиссия'];
  const bytes = await workbook.xlsx.writeBuffer();
  const file = { arrayBuffer: async () => bytes } as File;
  const { readBankStatement } = await import('./statementReconciliation');
  const result = await readBankStatement(file);
  expect(result.range).toEqual({ from: '2026-11-09', to: '2026-11-15' });
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0]).toMatchObject({ amount: 5200, postingDate: '2026-11-09' });
});
