import { isNewVersion, shouldReloadOnReturn, SILENT_RELOAD_AFTER_MS } from './appUpdate';

test('detects a newer build only when versions differ', () => {
  expect(isNewVersion('b', 'a')).toBe(true);
  expect(isNewVersion('a', 'a')).toBe(false);
  expect(isNewVersion(null, 'a')).toBe(false);
  expect(isNewVersion('b', 'dev')).toBe(false);
});

test('reloads silently only after a long break', () => {
  expect(shouldReloadOnReturn(null, 1_000)).toBe(false);
  expect(shouldReloadOnReturn(0, SILENT_RELOAD_AFTER_MS - 1)).toBe(false);
  expect(shouldReloadOnReturn(0, SILENT_RELOAD_AFTER_MS)).toBe(true);
});
