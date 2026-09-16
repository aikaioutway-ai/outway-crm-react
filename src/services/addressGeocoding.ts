import { loadYandexMaps } from '../utils/yandexMaps';

export interface GeocodingCandidate {
  address: string;
  latitude: number;
  longitude: number;
  precision?: string;
}

const BISHKEK_PREFIX = 'Кыргызстан, Бишкек';
const BISHKEK_BOUNDS = [[42.72, 74.35], [43.02, 74.95]];

export function normalizeBishkekAddress(address: string): string {
  const trimmed = address.trim();
  if (!trimmed) return '';
  if (/бишкек|кыргыз|киргиз|bishkek|kyrgyz/i.test(trimmed)) return trimmed;
  return `${BISHKEK_PREFIX}, ${trimmed}`;
}

function toCandidate(geoObject: any): GeocodingCandidate | null {
  const coordinates = geoObject?.geometry?.getCoordinates?.();
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const latitude = Number(coordinates[0]);
  const longitude = Number(coordinates[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const metadata = geoObject?.properties?.get?.('metaDataProperty')?.GeocoderMetaData;
  const address = geoObject?.getAddressLine?.()
    || metadata?.text
    || geoObject?.properties?.get?.('text')
    || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

  return { address, latitude, longitude, precision: metadata?.precision };
}

export async function geocodeAddress(address: string): Promise<GeocodingCandidate[]> {
  const query = normalizeBishkekAddress(address);
  if (!query) return [];
  const ymaps = await loadYandexMaps();
  const result = await ymaps.geocode(query, {
    results: 5,
    boundedBy: BISHKEK_BOUNDS,
    strictBounds: false,
  });
  const candidates: GeocodingCandidate[] = [];
  const count = Number(result?.geoObjects?.getLength?.() ?? 0);
  for (let index = 0; index < count; index += 1) {
    const candidate = toCandidate(result.geoObjects.get(index));
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<GeocodingCandidate> {
  const ymaps = await loadYandexMaps();
  const result = await ymaps.geocode([latitude, longitude], { results: 1 });
  const candidate = toCandidate(result?.geoObjects?.get?.(0));
  return candidate ?? {
    address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
    latitude,
    longitude,
  };
}

export async function getDrivingDistanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
  signal?: AbortSignal,
): Promise<number> {
  // OSRM expects longitude first, while Yandex Maps returns [latitude, longitude].
  const coordinates = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false&alternatives=false`, { signal });
  if (!response.ok) throw new Error(`OSRM: ${response.status}`);
  const payload = await response.json();
  const distanceMeters = Number(payload?.routes?.[0]?.distance);
  if (!Number.isFinite(distanceMeters)) throw new Error('Маршрут не найден');
  return Math.round(distanceMeters / 100) / 10;
}
