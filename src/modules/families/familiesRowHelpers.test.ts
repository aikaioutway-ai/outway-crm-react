import { isNewUnassignedRow } from './familiesRowHelpers';

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
