import { act, fireEvent, render, screen } from '@testing-library/react';
import LogisticsSchoolTransferDashboard from './LogisticsSchoolTransferDashboard';
import { useFamiliesTable } from '../../hooks/useCrmQueries';
import { updateV2TransferVehicleType } from '../../services/crmV2Service';
import { __resetTestTransfers, isInTestTransfer, isTestTransfer, setTestTransfer, TEST_TRANSFER_COLOR } from './testTransfers';

jest.mock('../../hooks/useCrmQueries', () => ({ useFamiliesTable: jest.fn(), useSchoolTransferNumbers: () => [] }));
jest.mock('../../services/crmV2Service', () => ({
  clearV2TransferVehicleType: jest.fn(),
  updateV2TransferVehicleType: jest.fn(),
}));

const mockedUseFamiliesTable = useFamiliesTable as jest.MockedFunction<typeof useFamiliesTable>;
const child = (rowId: string, transferNumber: string, status = 'boarded') => ({
  rowId, branchFilter: 'AES', branchId: 'branch-1', schoolId: 'school-1', status, transferNumber, vehicleType: 'microbus',
});

beforeEach(() => { act(() => __resetTestTransfers()); });

test('test mark is stored per school and transfer, and ignores rejected children', () => {
  act(() => setTestTransfer('AES', '3', true));
  expect(isTestTransfer('AES', '3')).toBe(true);
  expect(isTestTransfer('TIS', '3')).toBe(false);
  expect(isInTestTransfer({ branchFilter: 'AES', transferNumber: '3', status: 'boarded' })).toBe(true);
  expect(isInTestTransfer({ branchFilter: 'AES', transferNumber: '3', status: 'rejected' })).toBe(false);
  act(() => setTestTransfer('AES', '3', false));
  expect(isTestTransfer('AES', '3')).toBe(false);
});

test('marking a transfer as test greys it out, counts its children as without transfer and never touches the database', () => {
  mockedUseFamiliesTable.mockReturnValue({
    data: [child('c1', '1'), child('c2', '1'), child('c3', '')],
    refetch: jest.fn(),
  } as any);

  render(<LogisticsSchoolTransferDashboard schoolKey="AES" />);
  expect(screen.getByRole('button', { name: '1 Без №' })).toBeInTheDocument();

  fireEvent.contextMenu(screen.getByRole('button', { name: '2 1' }));
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Тестовый' }));

  expect(screen.getByRole('button', { name: '2 1' }).style.getPropertyValue('--cell-color')).toBe(TEST_TRANSFER_COLOR);
  expect(screen.getByRole('button', { name: '3 Без №' })).toBeInTheDocument();
  expect(updateV2TransferVehicleType).not.toHaveBeenCalled();
});
