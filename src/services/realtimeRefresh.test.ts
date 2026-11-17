import { queryClient } from './queryClient';
import { FAMILIES_CHANGED_EVENT, FamilyListRow, mergeFamilyRows, REALTIME_REFRESH_DELAY_MS, scheduleRealtimeFamiliesRefresh, watchRealtimeRefreshOnReturn } from './crmV2Service';

jest.mock('./supabase', () => ({ supabase: {} }));

let visibility: DocumentVisibilityState = 'visible';
let stopWatching: () => void;
const refreshes = jest.fn();

beforeAll(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  window.addEventListener(FAMILIES_CHANGED_EVENT, refreshes);
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
  refreshes.mockClear();
  visibility = 'visible';
  stopWatching = watchRealtimeRefreshOnReturn();
});

afterEach(() => {
  stopWatching();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('a burst of colleague changes refreshes the screen once after a pause', () => {
  for (let i = 0; i < 30; i++) scheduleRealtimeFamiliesRefresh();
  jest.advanceTimersByTime(REALTIME_REFRESH_DELAY_MS - 1);
  expect(refreshes).not.toHaveBeenCalled();

  jest.advanceTimersByTime(1);
  expect(refreshes).toHaveBeenCalledTimes(1);
});

test('a background tab waits and refreshes once when the employee returns', () => {
  visibility = 'hidden';
  scheduleRealtimeFamiliesRefresh();
  jest.advanceTimersByTime(REALTIME_REFRESH_DELAY_MS * 10);
  expect(refreshes).not.toHaveBeenCalled();

  visibility = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  document.dispatchEvent(new Event('visibilitychange'));
  expect(refreshes).toHaveBeenCalledTimes(1);
});

test('changes of a few families do not reload the whole families table', async () => {
  const invalidate = queryClient.invalidateQueries as jest.Mock;
  scheduleRealtimeFamiliesRefresh(['FAM-1']);
  scheduleRealtimeFamiliesRefresh(['FAM-2', 'FAM-1']);
  jest.advanceTimersByTime(REALTIME_REFRESH_DELAY_MS);
  await Promise.resolve();
  await Promise.resolve();
  const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
  expect(keys).not.toContain(JSON.stringify(['familiesTable']));
  expect(keys).toContain(JSON.stringify(['familiesPage']));
});

test('an unknown change still reloads everything once', () => {
  const invalidate = queryClient.invalidateQueries as jest.Mock;
  scheduleRealtimeFamiliesRefresh(['FAM-1']);
  scheduleRealtimeFamiliesRefresh('all');
  jest.advanceTimersByTime(REALTIME_REFRESH_DELAY_MS);
  const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
  expect(keys).toContain(JSON.stringify(['familiesTable']));
  expect(refreshes).toHaveBeenCalledTimes(1);
});

describe('mergeFamilyRows', () => {
  const row = (familyId: string, rowId: string, familyIndex: number, childName = rowId) => ({ familyId, rowId, familyIndex, childName }) as unknown as FamilyListRow;
  const current = [row('A', 'a1', 0), row('B', 'b1', 1), row('B', 'b2', 1), row('C', 'c1', 2)];

  test('replaces changed family in place and keeps the rest', () => {
    const merged = mergeFamilyRows(current, ['B'], [row('B', 'b1', 0, 'Новое имя')]);
    expect(merged.map(item => item.rowId)).toEqual(['a1', 'b1', 'c1']);
    expect(merged[1]).toMatchObject({ childName: 'Новое имя', familyIndex: 1 });
  });

  test('drops deleted families and puts new ones first', () => {
    const merged = mergeFamilyRows(current, ['C', 'N'], [row('N', 'n1', 0)]);
    expect(merged.map(item => item.rowId)).toEqual(['n1', 'a1', 'b1', 'b2']);
    expect(merged[0].familyIndex).toBeLessThan(0);
  });
});
