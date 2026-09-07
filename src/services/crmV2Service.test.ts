import { supabase } from './supabase';
import { fetchV2FamiliesPage } from './crmV2Service';

jest.mock('./supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

test('does not turn an explicitly empty school branch filter into all schools', async () => {
  await expect(fetchV2FamiliesPage({ branchIds: [] })).resolves.toEqual({
    rows: [],
    totalFamilies: 0,
    totalChildren: 0,
    totalWithTransfer: 0,
    totalWithoutTransfer: 0,
  });
  expect(supabase.rpc).not.toHaveBeenCalled();
});
