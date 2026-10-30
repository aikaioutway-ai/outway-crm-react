import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import CashierReviewPreview from './CashierReviewPreview';
import { SCHOOL_TABS } from './constants';

const school = SCHOOL_TABS.find(tab => tab.key !== 'ALL')!;
const base = { familyId: 'family-1', phone: '+996700000000', branchShort: school.key, transferNumber: '3', paymentMethod: 'transfer', receiptCode: null, paymentNumber: 1, actualPaymentDate: null, createdAt: '2026-10-05T10:00:00Z' };
jest.mock('../../services/supabase',()=>({supabase:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})}),upsert:async()=>({error:null})})}}));
jest.mock('../../hooks/useCrmQueries', () => ({
  usePaymentsTable: () => ({ isLoading: false, error: null, refetch: jest.fn(), data: [
    { ...base, id: 'p1', parentName: 'Иванова Анна', childrenNames: 'Иванов Тимур', amount: 6500, status: 'pending', receiptUrl: 'https://example.test/receipt.jpg', paymentDate: '2026-10-05' },
    { ...base, id: 'p2', parentName: 'Петрова Ольга', childrenNames: 'Петров Ден', amount: 4000, status: 'pending', receiptUrl: null, paymentDate: '2026-10-06' },
    { ...base, id: 'p3', parentName: 'Сидорова Мира', childrenNames: 'Сидоров Али', amount: 9000, status: 'confirmed', receiptUrl: null, paymentDate: '2026-10-07' },
  ] }),
  useRefundsTable: () => ({ isLoading: false, error: null, refetch: jest.fn(), data: [
    { id: 'r1', familyId: 'family-2', parentName: 'Ким Лея', phone: '', childrenNames: 'Ким Ян', branchShort: school.key, transferNumber: null, amount: 1500, comment: 'Переезд', status: 'pending', requestedBy: null, requestedAt: '2026-10-08T10:00:00Z', createdAt: '2026-10-08T10:00:00Z' },
  ] }),
}));

test('shows statuses and schools like spending, then a school table and a read-only receipt panel', async () => {
  const onOpenFamily = jest.fn().mockResolvedValue(undefined);
  render(<CashierReviewPreview periodKey="ALL" onOpenFamily={onOpenFamily} />);
  expect(screen.getByRole('button', { name: /На проверке/ })).toHaveTextContent('2 чека');
  expect(screen.getByRole('button', { name: /Подтверждённые/ })).toHaveTextContent('1 чек');
  expect(screen.getByRole('button', { name: /Возвраты/ })).toHaveTextContent('1 возврат');
  fireEvent.click(within(screen.getByRole('group', { name: 'Школы' })).getByRole('button', { name: new RegExp(school.label) }));
  expect(await screen.findByText('Иванова Анна')).toBeInTheDocument();
  expect(screen.getByText('Петрова Ольга')).toBeInTheDocument();
  expect(screen.queryByText('Сидорова Мира')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Иванова Анна'));
  const panel = screen.getByRole('complementary', { name: 'Подробности оплаты' });
  expect(within(panel).getByAltText('Чек оплаты')).toHaveAttribute('src', 'https://example.test/receipt.jpg');
  expect(within(panel).queryByRole('button', { name: /Подтвердить/ })).not.toBeInTheDocument();
  fireEvent.click(within(panel).getByRole('button', { name: /Открыть карточку семьи/ }));
  expect(onOpenFamily).toHaveBeenCalledWith('family-1');
  fireEvent.click(screen.getByRole('button', { name: 'К сводке' }));
  expect(screen.getByRole('group', { name: 'Школы' })).toBeInTheDocument();
});

test('search finds a payment across schools without choosing a school', async () => {
  render(<CashierReviewPreview periodKey="ALL" searchQuery="петров" />);
  expect(await screen.findByText('Петрова Ольга')).toBeInTheDocument();
  expect(screen.queryByText('Иванова Анна')).not.toBeInTheDocument();
});
