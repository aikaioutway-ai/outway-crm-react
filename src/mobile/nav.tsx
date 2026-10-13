import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';

/**
 * Экран внутри раздела. `sheet` — лист поверх текущего экрана
 * (карточка семьи, подтверждение), остальное — полноценные страницы.
 */
export type NavEntry =
  | { kind: 'school'; schoolKey: string }
  | { kind: 'transfer'; schoolKey: string; transfer: string }
  | { kind: 'drivers' }
  | { kind: 'employees' }
  | { kind: 'family'; familyId: string; sheet: true }
  | { kind: 'driver'; driverId: string; sheet: true }
  | { kind: 'employee'; employeeId: string; sheet: true }
  | { kind: 'payment'; paymentId: string; sheet: true };

interface MobileNavValue {
  stack: NavEntry[];
  direction: 'forward' | 'back';
  push: (entry: NavEntry) => void;
  back: () => void;
  reset: () => void;
}

const MobileNavContext = createContext<MobileNavValue | null>(null);

/**
 * Стек экранов связан с историей браузера: системная кнопка «назад» на
 * Android и свайп назад на iPhone закрывают лист или возвращают на экран выше,
 * а не выбрасывают из CRM.
 */
export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<NavEntry[]>([]);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const skipPopsRef = useRef(0);

  useEffect(() => {
    const onPop = () => {
      if (skipPopsRef.current > 0) {
        skipPopsRef.current -= 1;
        return;
      }
      setDirection('back');
      setStack(current => current.slice(0, -1));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const push = useCallback((entry: NavEntry) => {
    window.history.pushState({ outwayMobile: stackRef.current.length + 1 }, '');
    setDirection('forward');
    setStack(current => [...current, entry]);
  }, []);

  const back = useCallback(() => {
    if (stackRef.current.length === 0) return;
    window.history.back();
  }, []);

  const reset = useCallback(() => {
    const depth = stackRef.current.length;
    if (depth === 0) return;
    // Убираем из истории записи старого раздела, чтобы «назад» не листал пустоту.
    skipPopsRef.current += 1;
    window.history.go(-depth);
    setDirection('back');
    setStack([]);
  }, []);

  const value = useMemo(() => ({ stack, direction, push, back, reset }), [stack, direction, push, back, reset]);
  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}

export function useMobileNav(): MobileNavValue {
  const value = useContext(MobileNavContext);
  if (!value) throw new Error('useMobileNav must be used inside MobileNavProvider');
  return value;
}

/** Текущая страница (без листов) и лист поверх неё, если открыт. */
export function useNavPosition() {
  const nav = useMobileNav();
  const pages = nav.stack.filter(entry => !('sheet' in entry));
  const top = nav.stack[nav.stack.length - 1];
  return {
    ...nav,
    page: pages[pages.length - 1] ?? null,
    pageDepth: pages.length,
    sheet: top && 'sheet' in top ? top : null,
  };
}

const scrollPositions = new Map<string, number>();

/** Шапка + прокручиваемая область. Позиция прокрутки запоминается для «назад». */
export function Screen({ pageKey, title, subtitle, onBack, action, children }: {
  pageKey: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onBack?: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { direction } = useMobileNav();
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    node.scrollTop = direction === 'back' ? scrollPositions.get(pageKey) ?? 0 : 0;
  // Восстанавливаем прокрутку только при смене страницы.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]);

  return (
    <>
      <header className="m-header">
        {onBack && (
          <button type="button" className="m-header-back" aria-label="Назад" onClick={onBack}>
            <ChevronLeft size={26} />
          </button>
        )}
        <div className="m-header-titles">
          <div className="m-header-title">{title}</div>
          {subtitle && <div className="m-header-subtitle">{subtitle}</div>}
        </div>
        {action && <div className="m-header-action">{action}</div>}
      </header>
      <div className="m-content" ref={contentRef} onScroll={event => { scrollPositions.set(pageKey, event.currentTarget.scrollTop); }}>
        <div key={pageKey} className={`m-page ${direction === 'back' ? 'm-page--back' : ''}`}>
          {children}
        </div>
      </div>
    </>
  );
}
