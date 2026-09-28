import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LogisticsSchoolTransferDashboard from './LogisticsSchoolTransferDashboard';
import { useFamiliesTable } from '../../hooks/useCrmQueries';
import { updateV2TransferVehicleType } from '../../services/crmV2Service';

jest.mock('../../hooks/useCrmQueries', () => ({
  useFamiliesTable: jest.fn(),
}));

jest.mock('../../services/crmV2Service', () => ({
  clearV2TransferVehicleType: jest.fn(),
  updateV2TransferVehicleType: jest.fn(),
}));

const mockedUseFamiliesTable = useFamiliesTable as jest.MockedFunction<typeof useFamiliesTable>;
const mockedUpdateVehicleType = updateV2TransferVehicleType as jest.MockedFunction<typeof updateV2TransferVehicleType>;

test('shows the selected vehicle type immediately and refreshes the transfer data', async () => {
  let finishSave: ((value: string) => void) | undefined;
  const savePromise = new Promise<string>(resolve => { finishSave = resolve; });
  const refetch = jest.fn().mockResolvedValue({ data: [] });

  mockedUseFamiliesTable.mockReturnValue({
    data: [{
      rowId: 'child-1',
      branchFilter: 'AES',
      branchId: 'branch-1',
      schoolId: 'school-1',
      status: 'boarded',
      transferNumber: '1',
      vehicleType: 'microbus',
    }, {
      rowId: 'child-2',
      branchFilter: 'AES',
      branchId: 'branch-2',
      schoolId: 'school-1',
      status: 'boarded',
      transferNumber: '1',
      vehicleType: 'microbus',
    }],
    refetch,
  } as any);
  mockedUpdateVehicleType.mockReturnValue(savePromise);

  render(<LogisticsSchoolTransferDashboard schoolKey="AES" />);

  fireEvent.contextMenu(screen.getByRole('button', { name: /#1 МКР/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Минивэн' }));

  expect(screen.getByRole('button', { name: /#1 MINI/i })).toBeInTheDocument();
  expect(mockedUpdateVehicleType).toHaveBeenNthCalledWith(1, expect.objectContaining({
    branchId: 'branch-1',
    transferNumber: 1,
    vehicleType: 'minivan',
  }));

  finishSave?.('transfer-1');
  await waitFor(() => expect(mockedUpdateVehicleType).toHaveBeenNthCalledWith(2, expect.objectContaining({
    branchId: 'branch-2',
    transferNumber: 1,
    vehicleType: 'minivan',
  })));
  await waitFor(() => expect(refetch).toHaveBeenCalled());
});
