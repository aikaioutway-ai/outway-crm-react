import type { FamilyListRow } from '../../services/crmV2Service';
import type { RouteZone } from '../../services/routeZoneService';
import { SCHOOL_TABS, isSchoolAllowed } from './constants';

type ZoneShape = Pick<RouteZone, 'shapeType' | 'coordinates'>;

export interface ZoneTransferGroup {
  /** `${branchFilter}|${transferNumber ?? ''}` */
  key: string;
  branchFilter: string;
  schoolLabel: string;
  transferNumber: string | null;
  isCurrentSchool: boolean;
  /** Уникальные адреса этого трансфера внутри зоны. */
  pointsInZone: number;
  /** Все уникальные адреса этого трансфера (весь маршрут). */
  totalPoints: number;
  childrenInZone: number;
}

const ADDRESS_PRECISION = 5;

export function addressKey(lat: number, lon: number): string {
  return `${lat.toFixed(ADDRESS_PRECISION)},${lon.toFixed(ADDRESS_PRECISION)}`;
}

export function zoneTransferKey(branchFilter: string, transferNumber: string | null): string {
  return `${branchFilter}|${transferNumber ?? ''}`;
}

export function schoolLabelFor(branchFilter: string, fallback?: string): string {
  return SCHOOL_TABS.find(tab => tab.key === branchFilter)?.label ?? (fallback || branchFilter);
}

/** Ray casting по внешнему контуру; точки заданы как [lat, lon]. */
export function isPointInZone(lat: number, lon: number, zone: ZoneShape): boolean {
  const ring = zone.coordinates?.[0];
  if (!ring || ring.length < 3) return false;

  if (zone.shapeType === 'rectangle') {
    const lats = ring.map(point => point[0]);
    const lons = ring.map(point => point[1]);
    return lat >= Math.min(...lats) && lat <= Math.max(...lats)
      && lon >= Math.min(...lons) && lon <= Math.max(...lons);
  }

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lonI] = ring[i];
    const [latJ, lonJ] = ring[j];
    const crosses = (lonI > lon) !== (lonJ > lon)
      && lat < ((latJ - latI) * (lon - lonI)) / (lonJ - lonI) + latI;
    if (crosses) inside = !inside;
  }
  return inside;
}

type PointRow = FamilyListRow & { latitude: number; longitude: number };

function isActivePoint(row: FamilyListRow): row is PointRow {
  return row.status !== 'rejected' && row.latitude != null && row.longitude != null;
}

/**
 * Трансферы (по всем доступным школам), у которых хотя бы один адрес попадает в зону.
 * Дети без трансфера группируются отдельно по школе (transferNumber = null).
 */
export function collectZoneTransfers(
  rows: FamilyListRow[],
  zone: ZoneShape,
  options: { schoolKey: string; allowedSchools?: string[] },
): ZoneTransferGroup[] {
  const groups = new Map<string, ZoneTransferGroup & { inZone: Set<string>; all: Set<string> }>();

  rows.forEach(row => {
    if (!isActivePoint(row) || !row.branchFilter || !isSchoolAllowed(row.branchFilter, options.allowedSchools)) return;
    const key = zoneTransferKey(row.branchFilter, row.transferNumber || null);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        branchFilter: row.branchFilter,
        schoolLabel: schoolLabelFor(row.branchFilter, row.branchShort),
        transferNumber: row.transferNumber || null,
        isCurrentSchool: row.branchFilter === options.schoolKey,
        pointsInZone: 0,
        totalPoints: 0,
        childrenInZone: 0,
        inZone: new Set(),
        all: new Set(),
      };
      groups.set(key, group);
    }
    const address = addressKey(row.latitude, row.longitude);
    group.all.add(address);
    if (isPointInZone(row.latitude, row.longitude, zone)) {
      group.inZone.add(address);
      group.childrenInZone += 1;
    }
  });

  return Array.from(groups.values())
    .filter(group => group.inZone.size > 0)
    .map(({ inZone, all, ...group }) => ({ ...group, pointsInZone: inZone.size, totalPoints: all.size }))
    .sort((a, b) => (
      Number(b.isCurrentSchool) - Number(a.isCurrentSchool)
      || b.pointsInZone - a.pointsInZone
      || a.schoolLabel.localeCompare(b.schoolLabel)
      || Number(a.transferNumber ?? Infinity) - Number(b.transferNumber ?? Infinity)
    ));
}

/** Все дети (весь маршрут) выбранных трансферов — для слоя просмотра. */
export function rowsForZoneTransfers(
  rows: FamilyListRow[],
  keys: Iterable<string>,
  allowedSchools?: string[],
): PointRow[] {
  const wanted = new Set(keys);
  if (wanted.size === 0) return [];
  return rows.filter((row): row is PointRow => (
    isActivePoint(row)
    && isSchoolAllowed(row.branchFilter, allowedSchools)
    && wanted.has(zoneTransferKey(row.branchFilter, row.transferNumber || null))
  ));
}
