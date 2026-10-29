import { isTabletDevice } from './useIsMobile';

function device({ coarse, width, height }: { coarse: boolean; width: number; height: number }) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: query === '(pointer: coarse)' ? coarse : false, media: query, addEventListener() {}, removeEventListener() {} }),
  });
  Object.defineProperty(window, 'screen', { configurable: true, value: { width, height } });
}

afterEach(() => { sessionStorage.clear(); window.history.replaceState(null, '', '/'); });

test('an iPad gets the desktop layout scaled to its screen', () => {
  device({ coarse: true, width: 820, height: 1180 });
  expect(isTabletDevice()).toBe(true);
  device({ coarse: true, width: 1024, height: 768 });
  expect(isTabletDevice()).toBe(true);
});

test('phones and desktop computers are not tablets', () => {
  device({ coarse: true, width: 390, height: 844 });
  expect(isTabletDevice()).toBe(false);
  device({ coarse: false, width: 1920, height: 1080 });
  expect(isTabletDevice()).toBe(false);
});

test('the mobile preview link keeps the mobile version on a tablet', () => {
  device({ coarse: true, width: 820, height: 1180 });
  window.history.replaceState(null, '', '/?mobile=1');
  expect(isTabletDevice()).toBe(false);
});
