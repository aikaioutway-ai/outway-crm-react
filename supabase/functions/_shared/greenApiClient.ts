declare const Deno: { env: { get(name: string): string | undefined } };
export class GreenApiError extends Error {}

const methodSlots = new Map<string, number>();
const cached = new Map<string, { expires: number; data: unknown }>();
const pending = new Map<string, Promise<unknown>>();

async function waitForSlot(method: string) {
  const now = Date.now();
  const slot = Math.max(now, methodSlots.get(method) ?? now);
  methodSlots.set(method, slot + 1100);
  if (slot > now) await new Promise(resolve => setTimeout(resolve, slot - now));
}


async function performRequest(method: 'getChats' | 'getChatHistory' | 'getMessage' | 'getContacts' | 'getWaSettings' | 'getGroupData', body?: Record<string, unknown>): Promise<unknown> {
  const instance = Deno.env.get('GREEN_API_INSTANCE_ID')?.trim();
  const token = Deno.env.get('GREEN_API_TOKEN')?.trim();
  const host = Deno.env.get('GREEN_API_URL')?.trim();
  const missing = [!host && 'GREEN_API_URL', !instance && 'GREEN_API_INSTANCE_ID', !token && 'GREEN_API_TOKEN'].filter(Boolean);
  if (missing.length) throw new GreenApiError(`Не настроен доступ к Green API. В Supabase Secrets добавьте: ${missing.join(', ')}`);
  let base: URL;
  try { base = new URL(host!); } catch { throw new GreenApiError('Некорректный адрес Green API'); }
  if (base.protocol !== 'https:' || !/^(?:[a-z0-9-]+\.)*green-?api\.com$/.test(base.hostname) || base.username || base.password || base.port) throw new GreenApiError('Некорректный адрес Green API');
  await waitForSlot(method);
  try {
    const result = await fetch(`${base.origin}/waInstance${encodeURIComponent(instance!)}/${method}/${encodeURIComponent(token!)}${method === 'getContacts' ? '?group=true' : ''}`, {
      method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
    });
    if (!result.ok && method === 'getGroupData') {
      const detail = await result.clone().text();
      if (/\b(forbidden|item[- ]not[- ]found)\b/i.test(detail)) return null;
    }
    if (!result.ok) console.error('green_api_request_failed', JSON.stringify({ method, status: result.status }));
    if (!result.ok) throw new GreenApiError(result.status === 429 ? 'Green API ограничил частоту запросов. Повторите чуть позже.' : `Green API недоступен (${result.status}). Проверьте подключение номера и тариф.`);
    return await result.json();
  } catch (error) {
    if (error instanceof GreenApiError) throw error;
    // URL запроса содержит секрет: не передавать исходную ошибку в журнал или браузер.
    throw new GreenApiError('Не удалось получить ответ Green API. Повторите загрузку.');
  }
}

export async function greenApiRequest(method: 'getChats' | 'getChatHistory' | 'getMessage' | 'getContacts' | 'getWaSettings' | 'getGroupData', body?: Record<string, unknown>): Promise<unknown> {
  const cacheable = ['getChats', 'getContacts', 'getWaSettings', 'getGroupData'].includes(method);
  if (!cacheable) return performRequest(method, body);
  const key = `${method}:${JSON.stringify(body ?? {})}`;
  const entry = cached.get(key);
  if (entry && entry.expires > Date.now()) return entry.data;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const promise = performRequest(method, body).then(data => {
    cached.set(key, { data, expires: Date.now() + 15000 });
    return data;
  }).finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}
