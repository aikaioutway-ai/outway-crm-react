import { getBranchFilter, normalizeSchoolCode } from './constants';

test('normalizes Ilim Kадам to the school tab key used by pagination', () => {
  expect(normalizeSchoolCode('Ilim_k')).toBe('ILIM_K');
  expect(normalizeSchoolCode('ILIM KADAM')).toBe('ILIM_K');
  expect(getBranchFilter('Илим Кадам', 'Ilim_k')).toBe('ILIM_K');
  expect(getBranchFilter('Илим Кадам', 'ILIM KADAM')).toBe('ILIM_K');
  expect(getBranchFilter(null, 'ILIM_K')).toBe('ILIM_K');
});
