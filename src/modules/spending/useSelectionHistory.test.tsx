import { act, renderHook } from '@testing-library/react';
import { useSelectionHistory } from './useSelectionHistory';

test('returns through selection steps and clears history on close', () => {
  const { result } = renderHook(() => useSelectionHistory<string>());
  act(() => result.current.navigate('Категория'));
  act(() => result.current.navigate('Вид расхода'));
  act(() => result.current.navigate('Получатель'));
  expect(result.current.canGoBack).toBe(true);
  act(() => result.current.back());
  expect(result.current.panel).toBe('Вид расхода');
  act(() => result.current.back());
  expect(result.current.panel).toBe('Категория');
  expect(result.current.canGoBack).toBe(false);
  act(() => result.current.navigate(null));
  act(() => result.current.navigate('За период'));
  expect(result.current.canGoBack).toBe(false);
});

test('going back from period restores the drivers step', () => {
  const { result } = renderHook(() => useSelectionHistory<string>());
  act(() => result.current.navigate('school'));
  act(() => result.current.navigate('transfer'));
  act(() => result.current.navigate('drivers'));
  act(() => result.current.navigate('period'));
  act(() => result.current.back());
  expect(result.current.panel).toBe('drivers');
  act(() => result.current.back());
  expect(result.current.panel).toBe('transfer');
});
