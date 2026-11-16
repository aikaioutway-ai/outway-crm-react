import { fireEvent, render, screen, within } from '@testing-library/react';
import SummaryModule from './SummaryModule';
import { useFamiliesTable } from '../../hooks/useCrmQueries';
import type { FamilyListRow } from '../../services/crmV2Service';
import { groupStats, SUMMARY_GROUPS } from './summaryGroups';

jest.mock('../../hooks/useCrmQueries', () => ({ useFamiliesTable: jest.fn(), useMonthlyChargeStats: () => [] }));
jest.mock('../families/testTransfers', () => ({ useTestTransfers: jest.fn(), isInTestTransfer: () => false }));
jest.mock('../../services/supabase', () => ({ supabase: {} }));

const child = (id: string, school: string, transfer: string, vehicle: string, debt = 0, status = 'active') => ({
  rowId: id, familyId: `family-${id}`, branchFilter: school, transferNumber: transfer,
  vehicleType: vehicle, childDebtAmount: debt, debtAmount: debt, pendingPaymentCount: 0, status,
} as FamilyListRow);

beforeEach(() => {
  (useFamiliesTable as jest.Mock).mockReturnValue({ data: [], isPending: false, isError: false });
});

test('group tiles open a separate school dialog', () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
  render(<SummaryModule onOpenChild={jest.fn()} />);
  expect(screen.getAllByRole('button', { name: /Открыть Группа/ })).toHaveLength(3);
  expect(screen.queryByRole('heading', { name: 'Общая сводка' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Открыть Группа №1' }));
  expect(screen.getByRole('dialog', { name: 'Группа №1' })).toBeInTheDocument();
  expect(within(screen.getByRole('dialog')).getByText('TIS')).toBeInTheDocument();
  expect(within(screen.getByRole('dialog')).queryByText('AES')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('group counts use weighted bus average, distinguish schools and deduplicate family debts', () => {
  const rows = [
    child('a', 'TIS', '1', 'microbus', 100),
    { ...child('b', 'TIS', '1', 'microbus', 100), familyId: 'family-a' },
    child('c', 'EPS', '1', 'microbus'),
    child('d', 'EPS', '2', 'sedan', 300),
    child('e', 'EPS', '', '', 0, 'new'),
    child('f', 'EPS', '3', 'microbus', 900, 'rejected'),
  ];
  expect(groupStats([...rows, rows[0]])).toMatchObject({
    microbusCount: 2, microbusAverage: 1.5, lightVehicleCount: 1,
    newRequests: 1, debtorsCount: 2, debtSum: 400,
  });
});

test('every directory school belongs to exactly one group, with ABL exceptions preserved', () => {
  const keys = SUMMARY_GROUPS.flatMap(group => group.schools);
  expect(new Set(keys).size).toBe(keys.length);
  expect(SUMMARY_GROUPS[0].schools).toContain('ABL2');
  expect(SUMMARY_GROUPS[1].schools).toContain('ABL1');
  expect(SUMMARY_GROUPS[2].schools).toContain('AES');
});

test('summary page does not show the new requests list', () => {
  (useFamiliesTable as jest.Mock).mockReturnValue({ isPending: false, isError: false, data: [
    { ...child('a', 'TIS', '', '', 0, 'new'), childName: 'Ребёнок А' },
  ] });
  render(<SummaryModule onOpenChild={jest.fn()} />);
  expect(screen.queryByRole('heading', { name: 'Новые заявки' })).not.toBeInTheDocument();
  expect(screen.queryByText('Ребёнок А')).not.toBeInTheDocument();
});

test('a total metric opens a two-column breakdown with only schools that have data', () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  (useFamiliesTable as jest.Mock).mockReturnValue({ isPending: false, isError: false, data: [
    child('a', 'TIS', '', '', 0, 'new'),
    child('b', 'EPS', '1', 'microbus'),
  ] });

  render(<SummaryModule showGroupTotals onOpenChild={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Новые заявки/ }));

  const breakdown = within(screen.getByRole('dialog', { name: 'Новые заявки' }));
  expect(breakdown.getAllByRole('columnheader')).toHaveLength(2);
  expect(breakdown.getByText('TIS')).toBeInTheDocument();
  expect(breakdown.queryByText('EPS')).not.toBeInTheDocument();
});
