import { geocodeAddress, getDrivingDistanceKm, normalizeBishkekAddress } from './addressGeocoding';
import { loadYandexMaps } from '../utils/yandexMaps';

jest.mock('../utils/yandexMaps', () => ({ loadYandexMaps: jest.fn() }));

describe('addressGeocoding', () => {
  afterEach(() => jest.restoreAllMocks());

  test('adds Bishkek to a short address', () => {
    expect(normalizeBishkekAddress('ул. Токомбаева, 21/2'))
      .toBe('Кыргызстан, Бишкек, ул. Токомбаева, 21/2');
    expect(normalizeBishkekAddress('г. Бишкек, ул. Манаса, 10'))
      .toBe('г. Бишкек, ул. Манаса, 10');
  });

  test('maps Yandex results to address candidates', async () => {
    const geoObject = {
      geometry: { getCoordinates: () => [42.82, 74.61] },
      getAddressLine: () => 'Кыргызстан, Бишкек, улица Манаса, 10',
      properties: { get: () => ({ GeocoderMetaData: { precision: 'exact' } }) },
    };
    (loadYandexMaps as jest.Mock).mockResolvedValue({
      geocode: jest.fn().mockResolvedValue({
        geoObjects: { getLength: () => 1, get: () => geoObject },
      }),
    });

    await expect(geocodeAddress('Манаса, 10')).resolves.toEqual([{
      address: 'Кыргызстан, Бишкек, улица Манаса, 10',
      latitude: 42.82,
      longitude: 74.61,
      precision: 'exact',
    }]);
  });

  test('uses longitude-latitude order for OSRM and returns kilometers', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ routes: [{ distance: 12345 }] }),
    });
    global.fetch = fetchMock as typeof fetch;

    await expect(getDrivingDistanceKm(
      { latitude: 42.82, longitude: 74.61 },
      { latitude: 42.85, longitude: 74.58 },
    )).resolves.toBe(12.3);
    expect(fetchMock.mock.calls[0][0]).toContain('74.61,42.82;74.58,42.85');
  });
});
