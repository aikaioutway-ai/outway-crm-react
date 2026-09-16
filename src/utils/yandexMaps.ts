let loadPromise: Promise<any> | null = null;

export function loadYandexMaps(): Promise<any> {
  const w = window as any;
  if (w.ymaps?.Map) return Promise.resolve(w.ymaps);
  if (loadPromise) return loadPromise;

  const apiKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const params = new URLSearchParams({ lang: 'ru_RU', load: 'package.full' });
    if (apiKey) params.set('apikey', apiKey);
    script.src = `https://api-maps.yandex.ru/2.1/?${params.toString()}`;
    script.async = true;
    script.onload = () => w.ymaps.ready(() => resolve(w.ymaps));
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Не удалось загрузить Яндекс.Карты'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
