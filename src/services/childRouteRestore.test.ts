import { supabase } from './supabase';
import { updateV2ChildRoute } from './crmV2Service';

jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

const updates: Record<string, unknown>[] = [];
function mockChildStatus(status: string) {
  updates.length = 0;
  (supabase.from as jest.Mock).mockImplementation(() => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      single: () => Promise.resolve({ data: { status }, error: null }),
      update: (patch: Record<string, unknown>) => { updates.push(patch); return { eq: () => Promise.resolve({ error: null }) }; },
    };
    return chain;
  });
}

const child = { id: 'child-1', familyId: 'family-1', childName: 'Ребёнок', class: '', selfExitAllowed: false } as any;

test('choosing "—" for a rejected child brings them back from transfer X', async () => {
  mockChildStatus('rejected');
  await updateV2ChildRoute({ child, vehicleType: 'microbus', transferNumber: undefined });
  expect(updates).toEqual([expect.objectContaining({ status: 'new', transfer_id: null })]);
});

test('choosing "—" for a regular child keeps the status', async () => {
  mockChildStatus('new');
  await updateV2ChildRoute({ child, vehicleType: 'microbus', transferNumber: undefined });
  expect(updates).toEqual([{ transfer_id: null, stop_order: null, time_morning: null }]);
});
