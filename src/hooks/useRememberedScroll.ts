import { RefObject, useEffect, useLayoutEffect, useRef } from 'react';

// Позиции живут, пока открыта вкладка браузера: после перезагрузки экран снова открывается сверху.
const positions = new Map<string, number>();

/**
 * Запоминает прокрутку блока по ключу (например, «раздел:школа:вкладка») и возвращает её,
 * когда пользователь возвращается на тот же экран — переключение вкладок внутри школы
 * больше не отбрасывает таблицу наверх.
 * `ready` — данные уже нарисованы; до этого высота блока ещё не настоящая.
 */
export function useRememberedScroll(ref: RefObject<HTMLElement | null>, key: string, ready: boolean): void {
  const restoredKey = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const save = () => { if (restoredKey.current === key) positions.set(key, el.scrollTop); };
    el.addEventListener('scroll', save, { passive: true });
    return () => el.removeEventListener('scroll', save);
  }, [ref, key]);

  useLayoutEffect(() => {
    if (!ready || restoredKey.current === key) return;
    const el = ref.current;
    if (!el) return;
    el.scrollTop = positions.get(key) ?? 0;
    restoredKey.current = key;
  }, [ref, key, ready]);
}

/** Только для тестов. */
export function resetRememberedScroll(): void {
  positions.clear();
}
