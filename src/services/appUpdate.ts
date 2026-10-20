import { useEffect } from 'react';

/** Версия, с которой открыта страница. В тестах и без Vite — 'dev'. */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

/** Вернулся в CRM после такого перерыва — обновляемся сами: недописанной формы почти наверняка нет. */
export const SILENT_RELOAD_AFTER_MS = 120 * 60_000;
const RELOAD_GUARD_KEY = 'outway_update_reload_at';

export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json() as { version?: unknown };
    return typeof data.version === 'string' ? data.version : null;
  } catch {
    return null;
  }
}

export function isNewVersion(latest: string | null, current = APP_VERSION): boolean {
  return Boolean(latest) && current !== 'dev' && latest !== current;
}

export function shouldReloadOnReturn(hiddenAt: number | null, now: number): boolean {
  return hiddenAt !== null && now - hiddenAt >= SILENT_RELOAD_AFTER_MS;
}

/** Перезагрузка с защитой от зацикливания: не чаще раза в минуту. */
export function reloadApp(): void {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch { /* приватный режим — просто перезагружаем */ }
  window.location.reload();
}

/**
 * Тихое обновление CRM без плашек и кнопок. Новая версия подтягивается,
 * только когда сотрудник вернулся после перерыва от 2 часов: работу
 * посреди дня обновление не прерывает. Вход сохраняется.
 */
export function useSilentAppUpdate(): void {
  useEffect(() => {
    if (APP_VERSION === 'dev') return undefined;
    let hiddenAt: number | null = null;
    let stopped = false;

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      const longBreak = shouldReloadOnReturn(hiddenAt, Date.now());
      hiddenAt = null;
      if (!longBreak) return;
      void fetchLatestVersion().then(latest => { if (!stopped && isNewVersion(latest)) reloadApp(); });
    };
    // Старые куски кода удаляются при выкладке: если экран не открылся из-за этого — обновляемся.
    const onPreloadError = (event: Event) => {
      event.preventDefault();
      reloadApp();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('vite:preloadError', onPreloadError);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('vite:preloadError', onPreloadError);
    };
  }, []);
}
