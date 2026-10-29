import { isNewUnassignedRow, matchesLogisticsMapFilter, transferIdentityKey, transferVehicleSummary } from './familiesRowHelpers';

describe('logistics map filters', () => {
  it('shows every child without a transfer and test transfers, like the counter and the table', () => {
    const rows = [
      { status: 'new', transferNumber: null },
      { status: 'boarded', transferNumber: '2', isTestTransfer: true },
      { status: 'paused', transferNumber: null },
      { status: 'waiting', transferNumber: null },
      { status: 'boarded', transferNumber: '2' },
      { status: 'rejected', transferNumber: null },
      { status: 'rejected', transferNumber: '2', isTestTransfer: true },
    ];
    expect(rows.filter(row => matchesLogisticsMapFilter(row, 'empty'))).toEqual(rows.slice(0, 4));
  });

  it.each(['', 'empty', '2'])('excludes rejections for filter %s even with a transfer', filter => {
    expect(matchesLogisticsMapFilter({ status: 'rejected', transferNumber: '2', isTestTransfer: true }, filter)).toBe(false);
  });

  it('keeps selected routes separate and shows only rejections on the rejection map', () => {
    const row = { status: 'boarded', transferNumber: '2' };
    expect(matchesLogisticsMapFilter(row, '2')).toBe(true);
    expect(matchesLogisticsMapFilter(row, '3')).toBe(false);
    expect(matchesLogisticsMapFilter(row, 'rejected')).toBe(false);
    expect(matchesLogisticsMapFilter({ status: 'rejected', transferNumber: null }, 'rejected')).toBe(true);
    expect(matchesLogisticsMapFilter({ status: 'rejected', transferNumber: '2' }, 'rejected')).toBe(true);
  });
});

describe('isNewUnassignedRow', () => {
  it('counts a new child without a transfer', () => {
    expect(isNewUnassignedRow({ status: 'new', transferNumber: null })).toBe(true);
  });

  it('does not count a new child already assigned to a transfer', () => {
    expect(isNewUnassignedRow({ status: 'new', transferNumber: '6' })).toBe(false);
  });

  it('does not count an unassigned child with another status', () => {
    expect(isNewUnassignedRow({ status: 'boarded', transferNumber: null })).toBe(false);
  });
});

describe('transferIdentityKey', () => {
  it('treats the same ING transfer number across Indigo Kids and Asylkech as one transfer', () => {
    const indigoKids = transferIdentityKey({ transferNumber: '1', branchFilter: 'ING', branchId: 'indigo-kids' });
    const asylkech = transferIdentityKey({ transferNumber: '1', branchFilter: 'ING', branchId: 'asylkech' });

    expect(indigoKids).toBe('ING:1');
    expect(asylkech).toBe(indigoKids);
  });

  it('keeps different transfer numbers separate inside the combined school', () => {
    expect(transferIdentityKey({ transferNumber: '1', branchFilter: 'ING', branchId: 'indigo-kids' }))
      .not.toBe(transferIdentityKey({ transferNumber: '2', branchFilter: 'ING', branchId: 'asylkech' }));
  });

  it('counts matching Indigo Kids and Asylkech numbers once in the summary', () => {
    const rows = [
      { status: 'boarded', transferNumber: '1', branchFilter: 'ING', branchId: 'indigo-kids', vehicleType: 'microbus' },
      { status: 'boarded', transferNumber: '1', branchFilter: 'ING', branchId: 'asylkech', vehicleType: 'microbus' },
      { status: 'boarded', transferNumber: '2', branchFilter: 'ING', branchId: 'asylkech', vehicleType: 'microbus' },
    ] as Parameters<typeof transferVehicleSummary>[0];

    expect(transferVehicleSummary(rows)).toMatchObject({
      transferCount: 2,
      microbusCount: 2,
      studentCount: 3,
      microbusAverage: 1.5,
    });
  });
});

describe('vehicle type filter', () => {
  it('passes everything without a filter and only listed types with it', () => {
    const { matchesVehicleTypes, LIGHT_VEHICLE_TYPES } = jest.requireActual('./familiesRowHelpers');
    expect(matchesVehicleTypes({ vehicleType: 'microbus' })).toBe(true);
    expect(matchesVehicleTypes({ vehicleType: 'microbus' }, LIGHT_VEHICLE_TYPES)).toBe(false);
    expect(matchesVehicleTypes({ vehicleType: 'minivan' }, LIGHT_VEHICLE_TYPES)).toBe(true);
    expect(matchesVehicleTypes({ vehicleType: 'sedan' }, LIGHT_VEHICLE_TYPES)).toBe(true);
  });
});
