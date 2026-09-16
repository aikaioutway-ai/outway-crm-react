import { loadYandexMaps } from '../utils/yandexMaps';

export interface GeocodingCandidate {
  address: string;
  latitude: number;
  longitude: number;
  precision?: string;
}

export interface DrivingRouteSummary {
  distanceKm: number;
  durationMinutes: number;
  coordinates: number[][];
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

async function searchWithOpenStreetMap(query: string): Promise<GeocodingCandidate[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '5',
    countrycodes: 'kg',
    'accept-language': 'ru',
    viewbox: '74.35,43.02,74.95,42.72',
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
  if (!response.ok) throw new Error(`Поиск адреса: ${response.status}`);
  const rows = await response.json();
  return (Array.isArray(rows) ? rows : []).map((row: any) => ({
    address: String(row.display_name || query),
    latitude: Number(row.lat),
    longitude: Number(row.lon),
    precision: String(row.type || ''),
  })).filter((candidate: GeocodingCandidate) => Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude));
}

async function reverseWithOpenStreetMap(latitude: number, longitude: number): Promise<GeocodingCandidate> {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'jsonv2',
    'accept-language': 'ru',
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`);
  if (!response.ok) throw new Error(`Проверка точки: ${response.status}`);
  const row = await response.json();
  return {
    address: String(row?.display_name || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`),
    latitude,
    longitude,
    precision: String(row?.type || ''),
  };
}

export async function geocodeAddress(address: string): Promise<GeocodingCandidate[]> {
  const query = normalizeBishkekAddress(address);
  if (!query) return [];
  try {
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
    if (candidates.length > 0) return candidates;
  } catch {
    // The map itself can work without an API key while Yandex geocoding is disabled.
  }
  return searchWithOpenStreetMap(query);
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<GeocodingCandidate> {
  try {
    const ymaps = await loadYandexMaps();
    const result = await ymaps.geocode([latitude, longitude], { results: 1 });
    const candidate = toCandidate(result?.geoObjects?.get?.(0));
    if (candidate) return candidate;
  } catch {
    // Fall through to the public reverse geocoder when Yandex geocoding is unavailable.
  }
  return reverseWithOpenStreetMap(latitude, longitude);
}

export async function getDrivingRoute(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
  signal?: AbortSignal,
): Promise<DrivingRouteSummary> {
  // OSRM expects longitude first, while Yandex Maps returns [latitude, longitude].
  const coordinates = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&alternatives=false`, { signal });
  if (!response.ok) throw new Error(`OSRM: ${response.status}`);
  const payload = await response.json();
  const distanceMeters = Number(payload?.routes?.[0]?.distance);
  const durationSeconds = Number(payload?.routes?.[0]?.duration);
  const routeCoordinates = Array.isArray(payload?.routes?.[0]?.geometry?.coordinates)
    ? payload.routes[0].geometry.coordinates
      .map((coordinate: unknown[]) => [Number(coordinate?.[1]), Number(coordinate?.[0])])
      .filter((coordinate: number[]) => Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]))
    : [];
  if (!Number.isFinite(distanceMeters)) throw new Error('Маршрут не найден');
  return {
    distanceKm: Math.round(distanceMeters / 100) / 10,
    durationMinutes: Number.isFinite(durationSeconds) ? Math.max(1, Math.round(durationSeconds / 60)) : 0,
    coordinates: routeCoordinates,
  };
}

export async function getDrivingDistanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
  signal?: AbortSignal,
): Promise<number> {
  return (await getDrivingRoute(from, to, signal)).distanceKm;
}
