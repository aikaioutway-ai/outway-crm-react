import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import InlineFamilyCard from './InlineFamilyCard';
import { Family } from '../../types';

jest.mock('../../services/crmV2Service', () => ({
  addV2Audit: jest.fn().mockResolvedValue(undefined),
  createV2Child: jest.fn(),
  deleteV2Child: jest.fn(),
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

jest.mock('../../services/financeService', () => ({}));

const previewFamily: Family = {
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

test('shows the saved comment when the full family replaces the row preview with the same id', async () => {
  const { rerender } = render(<InlineFamilyCard family={previewFamily} onClose={jest.fn()} />);
  const savedComment = 'Позвонить родителю после 18:00';

  rerender(
    <InlineFamilyCard
      family={{ ...previewFamily, comment: savedComment }}
      onClose={jest.fn()}
    />,
  );

  const commentLabel = screen.getByText('Комментарий');
  const commentRow = commentLabel.closest('label');
  expect(commentRow).not.toBeNull();
  await waitFor(() => expect(within(commentRow as HTMLLabelElement).getByText(savedComment)).toBeInTheDocument());
});
