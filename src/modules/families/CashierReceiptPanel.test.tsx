import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CashierReceiptPanel from './CashierReceiptPanel';
import { fetchFamilyPayment, updateFamilyPayment } from '../../services/financeService';
jest.mock('../../services/financeService', () => ({ fetchFamilyPayment: jest.fn(), updateFamilyPayment: jest.fn() }));
const fetchPayment = jest.mocked(fetchFamilyPayment);
const update = jest.mocked(updateFamilyPayment);
const payment = { id: 'p1', familyId: 'f1', amount: 6800, paymentType: 'cash' as const, paymentDate: '2026-10-21', status: 'Подтверждено' as const, createdAt: '2026-10-21', receiptCode: '', receiptBank: '', receiptTime: '', receiptCardLast4: '', comment: '' };
beforeEach(() => { jest.resetAllMocks(); fetchPayment.mockResolvedValue(payment); update.mockResolvedValue(undefined); });

test('edits receipt fields beside PDF, saves metadata without changing amount and keeps failed draft', async () => {
  const saved = jest.fn();
  render(<CashierReceiptPanel paymentId="p1" parentName="Родитель" receiptUrl="/check.pdf" canEdit onClose={jest.fn()} onSaved={saved}/>);
  expect(screen.getByTitle('PDF чека')).toHaveAttribute('src', '/check.pdf');
  const code = await screen.findByLabelText('Код чека');
  fireEvent.change(code, {target: {value: 'receipt-123'}});
  update.mockRejectedValueOnce(new Error('Дубль в другой семье'));
  fireEvent.click(screen.getByRole('button', {name: 'Сохранить изменения'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Дубль в другой семье');
  expect(code).toHaveValue('receipt-123');
  expect(saved).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: 'Сохранить изменения'}));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(update.mock.calls[1][1]).toEqual(expect.objectContaining({receiptCode: 'receipt-123'}));
  expect(update.mock.calls[1][1]).not.toHaveProperty('amount');
});

test('read-only users can view image but cannot save', async () => {
  render(<CashierReceiptPanel paymentId="p1" parentName="Родитель" receiptUrl="/check.jpg" canEdit={false} onClose={jest.fn()} onSaved={jest.fn()}/>);
  expect(screen.getByAltText('Чек платежа')).toHaveAttribute('src', '/check.jpg');
  expect(await screen.findByLabelText('Код чека')).toBeDisabled();
  expect(screen.queryByRole('button', {name: 'Сохранить изменения'})).not.toBeInTheDocument();
});
