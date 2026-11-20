import { createFamilyPayment } from './financeService';
import { supabase } from './supabase';
import { canSubmitIncomingReceipt, IncomingReceiptRow, submitIncomingReceipt } from './incomingReceiptService';
import { allowedBranchIds, parseReceiptEdit } from '../../supabase/functions/_shared/incomingReceiptsAccess';
import { parseAllowedChats } from '../../supabase/functions/_shared/greenApiReceipt';

jest.mock('./supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
jest.mock('./financeService', () => ({ createFamilyPayment: jest.fn() }));

const invoke = supabase.functions.invoke as jest.Mock;
const createPayment = jest.mocked(createFamilyPayment);
const receipt: IncomingReceiptRow = {
  id: 'r1', kind: 'review', status: 'recognized', chatName: 'Трансфер 12', messageAt: '2026-11-18T10:00:00Z',
  senderPhone: '996555123456', senderName: 'Айгуль', caption: 'за май', fileName: null, mimeType: 'image/jpeg', hasFile: true,
  amount: 6800, receiptDate: '2026-11-18', receiptTime: 'нет', receiptCardLast4: '0176', receiptBank: 'MBANK', receiptCode: 'ABC',
  matchStatus: 'matched', familyMatchCount: 1, familyId: 'F1', parentName: 'Иванова', children: [],
  duplicateFamilyId: null, paymentId: null, submittedBy: null, error: null, transferId: null, transferNumber: null,
};

beforeEach(() => {
  jest.resetAllMocks();
  invoke.mockImplementation(async (_name: string, { body }: { body: { action: string } }) => ({
    data: body.action === 'fileUrl' ? { ok: true, url: 'https://files.example/r1' } : { ok: true }, error: null,
  }));
  global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) }) as never;
});

const actions = () => invoke.mock.calls.map(call => call[1].body.action);

test('creates a pending payment through the family flow and links it to the receipt', async () => {
  createPayment.mockResolvedValue({ id: 'P1' } as never);
  await submitIncomingReceipt('token', receipt, 'Менеджер');
  expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({
    familyId: 'F1', amount: 6800, paymentDate: '2026-11-18', paymentType: 'transfer', receiptCode: 'ABC', createdBy: 'Менеджер',
    receiptDetails: { time: '', cardLast4: '0176', bank: 'MBANK' }, comment: 'Чек из WhatsApp · Трансфер 12 · за май',
  }));
  expect(createPayment.mock.calls[0][0].receiptFile).toBeInstanceOf(File);
  expect(invoke.mock.calls.at(-1)?.[1].body).toEqual({ action: 'markSubmitted', id: 'r1', paymentId: 'P1' });
});

test('moves the receipt to duplicates when the payment flow rejects it', async () => {
  createPayment.mockRejectedValue(new Error('Дубль чека: этот файл уже загружен'));
  await expect(submitIncomingReceipt('token', receipt)).rejects.toThrow('Дубль чека');
  expect(actions()).toEqual(['fileUrl', 'recheckDuplicate']);
});

test('does not send a receipt without a family or an amount', async () => {
  expect(canSubmitIncomingReceipt({ ...receipt, familyId: null })).toBe(false);
  expect(canSubmitIncomingReceipt({ ...receipt, amount: null })).toBe(false);
  await expect(submitIncomingReceipt('token', { ...receipt, familyId: null })).rejects.toThrow('Заполните');
  expect(createPayment).not.toHaveBeenCalled();
});

test('limits employees to their schools and leaves leadership unrestricted', () => {
  const tabs = [{ key: 'TIS', label: 'TIS', codes: ['TENSAY'], branches: [] }, { key: 'ERU', label: 'ERU', codes: ['ERUDIT'], branches: [] }];
  const branches = [{ id: 'b1', code: 'TENSAY', short_name: null, name: 'Тенсай' }, { id: 'b2', code: 'ERUDIT', short_name: null, name: 'Эрудит' }];
  expect(allowedBranchIds({ role: 'manager', school_keys: ['TIS'] }, branches, tabs)).toEqual(['b1']);
  expect(allowedBranchIds({ role: 'manager', school_keys: ['ALL'] }, branches, tabs)).toBeNull();
  expect(allowedBranchIds({ role: 'director', school_keys: ['TIS'] }, branches, tabs)).toBeNull();
});

test('validates manual corrections', () => {
  expect(parseReceiptEdit({ amount: '6800', receiptDate: '2026-11-18' })).toEqual({ amount: 6800, receipt_date: '2026-11-18' });
  expect(() => parseReceiptEdit({ amount: 0 })).toThrow('сумму');
  expect(() => parseReceiptEdit({ receiptDate: '2026-02-31' })).toThrow('дату');
});

test('accepts only listed WhatsApp groups', () => {
  expect(Array.from(parseAllowedChats(' 1@g.us, 2@c.us ,,3@g.us'))).toEqual(['1@g.us', '3@g.us']);
  expect(parseAllowedChats(undefined).size).toBe(0);
});
