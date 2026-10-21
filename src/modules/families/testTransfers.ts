import { useSyncExternalStore } from 'react';

/**
 * «Тестовые» трансферы — черновики логиста для прикидки вариантов.
 * Отметка хранится только в этом браузере и не меняет базу: тип машины
 * и цены детей остаются прежними. Дети тестового трансфера считаются
 * как новые заявки (без трансфера).
 *
 * Ключ — `${школа}:${номер трансфера}`, как в transferIdentityKey.
 */
const STORAGE_KEY = 'outway:test-transfers';
export const TEST_TRANSFER_COLOR = '#94A3B8';

let marked = readStorage();
const listeners = new Set<() => void>();

function readStorage(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeStorage(next: Set<string>) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next))); } catch { /* приватный режим и т.п. */ }
}

function emit() { listeners.forEach(listener => listener()); }

if (typeof window !== 'undefined') {
  // Отметка, поставленная в соседней вкладке, сразу видна и здесь.
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    marked = readStorage();
    emit();
  });
}

export function testTransferKey(schoolKey: string, transferNumber: string | number): string {
  return `${schoolKey}:${transferNumber}`;
}

export function isTestTransfer(schoolKey: string | null | undefined, transferNumber: string | number | null | undefined): boolean {
  if (!schoolKey || transferNumber === null || transferNumber === undefined || transferNumber === '') return false;
  return marked.has(testTransferKey(schoolKey, transferNumber));
}

export function setTestTransfer(schoolKey: string, transferNumber: string | number, value: boolean) {
  const key = testTransferKey(schoolKey, transferNumber);
  if (marked.has(key) === value) return;
  const next = new Set(marked);
  if (value) next.add(key); else next.delete(key);
  marked = next;
  writeStorage(next);
  emit();
}

/** Ребёнок едет в тестовом трансфере (отказники не считаются). */
export function isInTestTransfer(row: { status?: string | null; transferNumber?: string | null; branchFilter?: string | null }): boolean {
  return row.status !== 'rejected' && isTestTransfer(row.branchFilter, row.transferNumber);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Возвращает текущий набор отметок; компонент перерисуется при любом изменении. */
export function useTestTransfers(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => marked, () => marked);
}

/** Только для тестов. */
export function __resetTestTransfers() { marked = new Set(); writeStorage(marked); emit(); }
