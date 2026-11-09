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
const route = (transferNumber: any, comment?: string) => updateV2ChildRoute({ child, vehicleType: 'microbus', transferNumber, comment });

test('leaving X without a comment is refused and changes nothing', async () => {
  mockChildStatus('rejected');
  await expect(route(undefined)).rejects.toThrow('комментарий');
  await expect(route('!')).rejects.toThrow('комментарий');
  expect(updates).toEqual([]);
});

test('choosing "—" for a rejected child with a comment brings them back from X', async () => {
  mockChildStatus('rejected');
  await route(undefined, ' Родитель передумал ');
  expect(updates).toEqual([expect.objectContaining({ status: 'new', transfer_id: null, transfer_mark: null, transfer_comment: 'Родитель передумал' })]);
});

test('choosing "—" for a regular child keeps the status and clears the mark', async () => {
  mockChildStatus('new');
  await route(undefined);
  expect(updates).toEqual([{ transfer_id: null, transfer_mark: null, stop_order: null, time_morning: null }]);
});

test('"!" needs no comment, "?" and X do', async () => {
  mockChildStatus('new');
  await route('!');
  expect(updates).toEqual([expect.objectContaining({ status: 'new', transfer_id: null, transfer_mark: 'in_work' })]);
  mockChildStatus('new');
  await expect(route('?')).rejects.toThrow('комментарий');
  await route('?', 'Ждём ответ родителя');
  expect(updates).toEqual([expect.objectContaining({ transfer_mark: 'waiting', transfer_comment: 'Ждём ответ родителя' })]);
  mockChildStatus('boarded');
  await expect(route('X')).rejects.toThrow('комментарий');
  await route('X', 'Дорого');
  expect(updates).toEqual([expect.objectContaining({ status: 'rejected', stop_order: null, transfer_comment: 'Дорого' })]);
});
