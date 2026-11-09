import { fireEvent, render, screen, within } from '@testing-library/react';
import SummaryModule from './SummaryModule';
import { useFamiliesTable } from '../../hooks/useCrmQueries';
import type { FamilyListRow } from '../../services/crmV2Service';
import { groupStats, SUMMARY_GROUPS } from './summaryGroups';

jest.mock('../../hooks/useCrmQueries', () => ({ useFamiliesTable: jest.fn() }));
jest.mock('../families/testTransfers', () => ({ useTestTransfers: jest.fn(), isInTestTransfer: () => false }));
jest.mock('../../services/supabase', () => ({ supabase: {} }));

const child = (id: string, school: string, transfer: string, vehicle: string, debt = 0, status = 'active') => ({
  rowId: id, familyId: `family-${id}`, branchFilter: school, transferNumber: transfer,
  vehicleType: vehicle, childDebtAmount: debt, status,
} as FamilyListRow);

beforeEach(() => {
  (useFamiliesTable as jest.Mock).mockReturnValue({ data: [], isPending: false, isError: false });
});

test('group tiles open a separate school dialog', () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
  render(<SummaryModule onOpenChild={jest.fn()} />);
  expect(screen.getByRole('table')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /Открыть Группа/ })).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Открыть Группа №1' }));
  expect(screen.getByRole('dialog', { name: 'Группа №1' })).toBeInTheDocument();
  expect(within(screen.getByRole('dialog')).getByText('TIS')).toBeInTheDocument();
  expect(within(screen.getByRole('dialog')).queryByText('AES')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('group counts use weighted bus average, distinguish schools and deduplicate child debts', () => {
  const rows = [
    child('a', 'TIS', '1', 'microbus', 100),
    child('b', 'TIS', '1', 'microbus', 200),
    child('c', 'EPS', '1', 'microbus'),
    child('d', 'EPS', '2', 'sedan', 300),
    child('e', 'EPS', '', '', 0, 'new'),
    child('f', 'EPS', '3', 'microbus', 900, 'rejected'),
  ];
  expect(groupStats([...rows, rows[0]])).toMatchObject({
    microbusCount: 2, microbusAverage: 1.5, lightVehicleCount: 1,
    newRequests: 1, debtorsCount: 3, debtSum: 600,
  });
});

test('every directory school belongs to exactly one group, with ABL exceptions preserved', () => {
  const keys = SUMMARY_GROUPS.flatMap(group => group.schools);
  expect(new Set(keys).size).toBe(keys.length);
  expect(SUMMARY_GROUPS[0].schools).toContain('ABL2');
  expect(SUMMARY_GROUPS[1].schools).toContain('ABL1');
  expect(SUMMARY_GROUPS[2].schools).toContain('AES');
});


test('school bar filters new requests and opens the child card', () => {
  const onOpen = jest.fn();
  (useFamiliesTable as jest.Mock).mockReturnValue({ isPending: false, isError: false, data: [
    { ...child('a', 'TIS', '', '', 0, 'new'), childName: 'Ребёнок А' },
    { ...child('b', 'EPS', '', '', 0, 'new'), childName: 'Ребёнок Б' },
    { ...child('c', 'TIS', '', '', 0, 'new'), childName: 'В работе', requestStage: 'in_work' },
  ] });
  render(<SummaryModule onOpenChild={onOpen} />);
  expect(screen.getByText('Ребёнок А')).toBeInTheDocument();
  expect(screen.getByText('Ребёнок Б')).toBeInTheDocument();
  expect(screen.queryByText('В работе')).not.toBeInTheDocument();
  fireEvent.click(screen.getByTitle('TIS · 1 новых заявок'));
  expect(screen.queryByText('Ребёнок Б')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ребёнок А' }));
  expect(onOpen).toHaveBeenCalledWith('family-a', 'a');
  fireEvent.click(screen.getByTitle('Все школы · 2 новых заявок'));
  expect(screen.getByText('Ребёнок Б')).toBeInTheDocument();
});
