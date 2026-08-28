import {
  EMPLOYEE_SESSION_EXPIRED_MESSAGE,
  getEmployeeSessionExpiresAt,
  isEmployeeSessionActive,
  isEmployeeSessionExpiredMessage,
} from './employeeSession';

function sessionToken(role: 'admin' | 'gen_director', exp: number): string {
  const payload = btoa(JSON.stringify({ sub: `qa-${role}`, role, exp }))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
  return `${payload}.test-signature`;
}

describe.each(['admin', 'gen_director'] as const)('%s expense session', role => {
  test('accepts an active signed-session payload', () => {
    const token = sessionToken(role, 2_000);
    expect(getEmployeeSessionExpiresAt(token)).toBe(2_000_000);
    expect(isEmployeeSessionActive(token, 1_999_999)).toBe(true);
  });

  test('rejects an expired signed-session payload', () => {
    expect(isEmployeeSessionActive(sessionToken(role, 2_000), 2_000_000)).toBe(false);
  });
});

test('recognizes the new expense-api expired-session response', () => {
  expect(isEmployeeSessionExpiredMessage(EMPLOYEE_SESSION_EXPIRED_MESSAGE)).toBe(true);
  expect(isEmployeeSessionExpiredMessage('Edge Function returned a non-2xx status code')).toBe(false);
});
