import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import CompensationFamilyFinance from './CompensationFamilyFinance';
import { fetchFinanceSnapshot } from '../../services/financeService';
jest.mock('../../services/financeService', () => ({ fetchFinanceSnapshot: jest.fn() }));
const fetchSnapshot = jest.mocked(fetchFinanceSnapshot);

test('shows the selected family balance and payment history', async () => {
  fetchSnapshot.mockResolvedValue({ mainBalance: 500, payments: [{ id: 'p1', amount: 2000, paymentDate: '2026-10-14', status: 'Подтверждено' }] } as Awaited<ReturnType<typeof fetchFinanceSnapshot>>);
  render(<CompensationFamilyFinance familyId="family1" />);
  expect(await screen.findByRole('table', { name: 'История платежей семьи' })).toBeInTheDocument();
  expect(fetchSnapshot).toHaveBeenCalledWith('family1');
  expect(screen.getByText('500 сом')).toBeInTheDocument();
  expect(screen.getByText('14.10.2026')).toBeInTheDocument();
  expect(screen.getByText('Подтверждено')).toBeInTheDocument();
});

test('shows a load error rather than a zero balance', async () => {
  fetchSnapshot.mockRejectedValue(new Error('Unavailable'));
  render(<CompensationFamilyFinance familyId="family2" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить');
  expect(screen.queryByText('Баланс семьи:')).not.toBeInTheDocument();
});

test('pages through history without losing older payments', async () => {
  fetchSnapshot.mockResolvedValue({ mainBalance: 0, payments: [1, 2, 3, 4].map(day => ({ id: String(day), amount: 100, paymentDate: `2026-10-0${day}`, status: 'Подтверждено' })) } as Awaited<ReturnType<typeof fetchFinanceSnapshot>>);
  render(<CompensationFamilyFinance familyId="family3" />);
  await screen.findByRole('table', { name: 'История платежей семьи' });
  expect(screen.queryByText('01.10.2026')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Следующие платежи' }));
  expect(screen.getByText('01.10.2026')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Следующие платежи' })).toBeDisabled();
});

test('a parent refund shows how much leaves the family balance', async () => {
  fetchSnapshot.mockResolvedValue({ mainBalance: 5000, payments: [] } as unknown as Awaited<ReturnType<typeof fetchFinanceSnapshot>>);
  render(<CompensationFamilyFinance familyId="family4" walletChange={2000} />);
  expect(await screen.findByText(/спишется/)).toHaveTextContent('спишется 2 000 сом. Баланс станет 3 000 сом.');
});
