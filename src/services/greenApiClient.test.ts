const originalFetch = globalThis.fetch;
const originalDeno = Object.getOwnPropertyDescriptor(globalThis, 'Deno');

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  Object.defineProperty(globalThis, 'Deno', { configurable: true, value: { env: { get: (name: string) => ({
    GREEN_API_INSTANCE_ID: '123', GREEN_API_TOKEN: 'test-token', GREEN_API_URL: 'https://7107.api.greenapi.com',
  } as Record<string, string>)[name] } } });
});
afterEach(() => {
  jest.useRealTimers(); globalThis.fetch = originalFetch;
  if (originalDeno) Object.defineProperty(globalThis, 'Deno', originalDeno);
  else Reflect.deleteProperty(globalThis, 'Deno');
});

test('spaces requests for different groups by at least one second and shares identical requests', async () => {
  const fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ groupId: 'group@g.us' }) });
  globalThis.fetch = fetch;
  const { greenApiRequest } = await import('../../supabase/functions/_shared/greenApiClient');
  const first = greenApiRequest('getGroupData', { groupId: 'a@g.us' });
  const duplicate = greenApiRequest('getGroupData', { groupId: 'a@g.us' });
  const second = greenApiRequest('getGroupData', { groupId: 'b@g.us' });
  await jest.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1000);
  expect(fetch).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(100);
  await Promise.all([first, duplicate, second]);
  expect(fetch).toHaveBeenCalledTimes(2);
  await greenApiRequest('getGroupData', { groupId: 'a@g.us' });
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('recognizes an exited group reported by the provider as HTTP 500', async () => {
  globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, clone: () => ({ text: async () => '{"message":"Error: item not found"}' }) });
  const { greenApiRequest } = await import('../../supabase/functions/_shared/greenApiClient');
  await expect(greenApiRequest('getGroupData', { groupId: 'old@g.us' })).resolves.toBeNull();
});

export {};
