import type { FamilyPayment } from '../../types';
import { reconcileBankStatement } from './statementReconciliation';

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
  expect(result.group).toBe('3');
  expect(result.candidates).toHaveLength(1);
  expect(reconcileBankStatement([{ ...entry, codes: [], amount: 12000 }], [payment])[0].group).toBe('Х');
});

test('does not suggest a code-matched payment for another statement row', () => {
  expect(reconcileBankStatement([entry, { ...entry, number: 13, codes: [] }], [payment]).map(row => row.group))
    .toEqual(['1', 'Х']);
});
