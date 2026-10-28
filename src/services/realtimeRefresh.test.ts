import { queryClient } from './queryClient';
import { FAMILIES_CHANGED_EVENT, REALTIME_REFRESH_DELAY_MS, scheduleRealtimeFamiliesRefresh, watchRealtimeRefreshOnReturn } from './crmV2Service';

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
