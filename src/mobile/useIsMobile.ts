import { useEffect, useState } from 'react';

const MOBILE_MAX_WIDTH = 760;
const FORCE_DESKTOP_KEY = 'outway_force_desktop';
const DESKTOP_VIEWPORT = 'width=1280';
const PREVIEW_KEY = 'outway_mobile_preview';
const MOBILE_VIEWPORT = 'width=device-width, initial-scale=1.0, viewport-fit=cover';

/**
 * Телефон определяем по размеру экрана устройства, а не только по ширине окна:
 * в полной версии страница шире экрана (1280px), но это всё ещё телефон.
 */
function isPhone(): boolean {
  if (typeof window === 'undefined') return false;
  if (isMobilePreview()) return true;
  if (typeof window.matchMedia === 'function' && window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches) return true;
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return coarse && Math.min(window.screen?.width ?? Infinity, window.screen?.height ?? Infinity) <= MOBILE_MAX_WIDTH;
}

/**
 * Планшет (iPad и т.п.): сенсорный экран шире телефона. Мобильный интерфейс ему
 * не нужен, а полная версия рисуется шириной компьютера и уменьшается под экран —
 * расположение то же, что на мониторе, просто мельче.
 */
export function isTabletDevice(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  if (isMobilePreview() || !window.matchMedia('(pointer: coarse)').matches) return false;
  return Math.min(window.screen?.width ?? 0, window.screen?.height ?? 0) > MOBILE_MAX_WIDTH;
}

/**
 * Просмотр мобильной версии на компьютере по ссылке `?mobile=1`
 * (`?mobile=0` выключает). Выбор держится до закрытия вкладки.
 */
export function isMobilePreview(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const param = new URLSearchParams(window.location.search).get('mobile');
    if (param === '1') {
      sessionStorage.setItem(PREVIEW_KEY, '1');
      // Ссылка на мобильную версию важнее ранее выбранной «полной версии».
      localStorage.removeItem(FORCE_DESKTOP_KEY);
    }
    if (param === '0') sessionStorage.removeItem(PREVIEW_KEY);
    return sessionStorage.getItem(PREVIEW_KEY) === '1';
  } catch {
    return new URLSearchParams(window.location.search).get('mobile') === '1';
  }
}

/** Экран телефона: на нём CRM показывает отдельный мобильный интерфейс. */
export function useIsMobileViewport(): boolean {
  const [mobile, setMobile] = useState(isPhone);
  useEffect(() => {
    const update = () => setMobile(isPhone());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return mobile;
}

function readForceDesktop(): boolean {
  try { return localStorage.getItem(FORCE_DESKTOP_KEY) === '1'; } catch { return false; }
}

/** Сотрудник может открыть на телефоне полную версию и вернуться в мобильную. */
export function useForceDesktop(): [boolean, (value: boolean) => void] {
  const [forced, setForced] = useState(readForceDesktop);
  const update = (value: boolean) => {
    try {
      if (value) localStorage.setItem(FORCE_DESKTOP_KEY, '1');
      else localStorage.removeItem(FORCE_DESKTOP_KEY);
    } catch { /* приватный режим — выбор живёт до перезагрузки */ }
    setForced(value);
  };
  return [forced, update];
}

/**
 * Полная версия на телефоне рисуется шириной компьютера, как «версия для ПК»
 * в браузере: страницу можно уменьшать, увеличивать и двигать пальцами.
 */
export function useDesktopViewport(enabled: boolean): void {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    meta.content = enabled ? DESKTOP_VIEWPORT : MOBILE_VIEWPORT;
  }, [enabled]);
}
