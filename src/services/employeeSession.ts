export const EMPLOYEE_SESSION_EXPIRED_EVENT = 'outway:employee-session-expired';
export const EMPLOYEE_SESSION_EXPIRED_MESSAGE = 'Сессия недействительна или истекла';

export function getEmployeeSessionExpiresAt(sessionToken?: string): number | null {
  if (!sessionToken) return null;
  try {
    const [payloadPart, signaturePart, extra] = sessionToken.split('.');
    if (!payloadPart || !signaturePart || extra) return null;
    const base64 = payloadPart.replaceAll('-', '+').replaceAll('_', '/')
      + '='.repeat((4 - payloadPart.length % 4) % 4);
    const binary = atob(base64);
    const encoded = Array.from(binary, char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join('');
    const payload = JSON.parse(decodeURIComponent(encoded));
    const expiresAt = Number(payload?.exp) * 1000;
    return Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null;
  } catch {
    return null;
  }
}

export function isEmployeeSessionActive(sessionToken?: string, now = Date.now()): boolean {
  const expiresAt = getEmployeeSessionExpiresAt(sessionToken);
  return expiresAt !== null && expiresAt > now;
}

export function isEmployeeSessionExpiredMessage(message: string): boolean {
  return message.includes(EMPLOYEE_SESSION_EXPIRED_MESSAGE);
}
