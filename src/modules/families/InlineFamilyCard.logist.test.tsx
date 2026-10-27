import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import InlineFamilyCard from './InlineFamilyCard';
import { Family } from '../../types';
import { fetchFamilyDocuments } from '../../services/familyDocumentService';
import { fetchFinanceSnapshot } from '../../services/financeService';

jest.mock('../../services/crmV2Service', () => ({
  addV2Audit: jest.fn().mockResolvedValue(undefined),
  createV2Child: jest.fn(),
  fetchV2Branches: jest.fn().mockResolvedValue([]),
  fetchV2Children: jest.fn().mockResolvedValue([]),
  updateV2Child: jest.fn(),
  updateV2ChildRoute: jest.fn(),
  updateV2Family: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/familyDocumentService', () => {
  const actual = jest.requireActual('../../services/familyDocumentService');
  return {
    ...actual,
    fetchFamilyDocuments: jest.fn().mockResolvedValue(actual.createDefaultFamilyDocuments()),
    saveFamilyDocuments: jest.fn(),
  };
});

jest.mock('../../services/financeService', () => ({
  fetchFinanceSnapshot: jest.fn().mockResolvedValue({ charges: [], payments: [], paymentItems: [], refunds: [], mainBalance: 0 }),
}));

const family: Family = {
  id: 'family-1',
  schoolCode: 'AES',
  parentName: 'Родитель',
  phone: '+996700000000',
  fullAddress: 'Бишкек',
  zone: 'A',
  vehicleType: 'microbus',
  monthlyPrice: 6000,
  comment: '',
  createdAt: '',
  status: 'active',
};

const tabLabels = () => screen.getByRole('navigation', { name: 'Разделы карточки клиента' }).querySelectorAll('button');

beforeEach(() => jest.clearAllMocks());

test('logist sees only overview, children and history, and money/documents are not loaded', async () => {
  render(<InlineFamilyCard family={family} onClose={jest.fn()} userRole="logist" initialTab="finance" />);

  await waitFor(() => expect(tabLabels()).toHaveLength(3));
  expect(Array.from(tabLabels()).map(button => button.title)).toEqual(['Обзор', 'Дети', 'История']);
  expect(screen.queryByText('Баланс счёта')).toBeNull();
  expect(screen.queryByText('Задолженность')).toBeNull();
  expect(fetchFinanceSnapshot).not.toHaveBeenCalled();
  expect(fetchFamilyDocuments).not.toHaveBeenCalled();
});

test('manager still sees money tabs and the account balance', async () => {
  render(<InlineFamilyCard family={family} onClose={jest.fn()} userRole="manager" />);

  await waitFor(() => expect(fetchFinanceSnapshot).toHaveBeenCalled());
  expect(Array.from(tabLabels()).map(button => button.title)).toEqual(['Обзор', 'Дети', 'Начисления', 'Платежи и чеки', 'Документы']);
  expect(screen.getByText('Баланс счёта')).toBeInTheDocument();
});
