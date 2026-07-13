import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchV2Branches,
  fetchV2Family,
  fetchV2FamiliesTableCached,
  getCachedV2FamiliesTable,
  updateV2ChildRoute,
  FamilyListRow,
  V2BranchOption,
} from '../../services/crmV2Service';
import { Family, VehicleType } from '../../types';
import { loadYandexMaps } from '../../utils/yandexMaps';
import { VEHICLE_COLOR } from './LogisticsSchoolTransferDashboard';
import { SCHOOL_TABS } from './constants';
import { SCHOOL_COLORS } from './LogisticsOverview';
import SchoolDockSidebar, { SCHOOL_DOCK_HIDDEN_WIDTH, SCHOOL_DOCK_WIDTH } from './SchoolDockSidebar';
import InlineFamilyCard from './InlineFamilyCard';

interface LogisticsMapViewProps {
  schoolKey: string;
  transferFilter: string;
  userRole?: string;
  userName?: string;
  onSelectSchool: (key: string) => void;
  onSidebarWidthChange?: (width: number) => void;
}

type PointRow = FamilyListRow & { latitude: number; longitude: number };

const BISHKEK_CENTER: [number, number] = [42.8746, 74.5698];
const FALLBACK_COLOR = '#626C8B';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] as string));
}

const TRANSFER_SELECT_OPTIONS = Array.from({ length: 30 }, (_, i) => String(i + 1));
const STOP_SELECT_OPTIONS = Array.from({ length: 20 }, (_, i) => String(i + 1));

function buildSelectOptions(options: string[], selected: string | null): string {
  const blank = `<option value="" ${selected ? '' : 'selected'}>—</option>`;
  const rest = options.map(value => `<option value="${value}" ${selected === value ? 'selected' : ''}>${value}</option>`).join('');
  return blank + rest;
}

function buildBalloonBody(address: string, group: PointRow[]): string {
  const childBlocks = group.map(row => `
    <div data-block="${row.rowId}" style="margin-top:8px;padding-top:8px;border-top:1px solid #E1E8EA;">
      <button data-role="open-family" data-family-id="${row.familyId}" style="background:none;border:none;padding:0;margin-bottom:6px;font-weight:700;font-size:13px;color:#17222F;cursor:pointer;text-decoration:underline;text-underline-offset:2px;">${escapeHtml(row.childName)}</button>
      <div style="display:flex;gap:6px;align-items:center;">
        <select data-role="transfer" style="width:88px;padding:4px 6px;border:1px solid #D7E0E3;border-radius:6px;font-size:12px;">
          ${buildSelectOptions(TRANSFER_SELECT_OPTIONS, row.transferNumber)}
        </select>
        <select data-role="stop" style="width:80px;padding:4px 6px;border:1px solid #D7E0E3;border-radius:6px;font-size:12px;">
          ${buildSelectOptions(STOP_SELECT_OPTIONS, row.stopNumber)}
        </select>
        <button data-role="save" style="padding:4px 10px;border:none;border-radius:6px;background:#2DD4BF;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">Сохранить</button>
      </div>
      <div data-role="status" style="font-size:11px;color:#7A859D;margin-top:4px;min-height:14px;"></div>
    </div>
  `).join('');
  return `${escapeHtml(address)}${childBlocks}`;
}

export default function LogisticsMapView({ schoolKey, transferFilter, userRole, userName, onSelectSchool, onSidebarWidthChange }: LogisticsMapViewProps) {
  const [rows, setRows] = useState<FamilyListRow[] | null>(() => getCachedV2FamiliesTable());
  const [branches, setBranches] = useState<V2BranchOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [openFamily, setOpenFamily] = useState<Family | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const ymapsRef = useRef<any>(null);
  const rowsRef = useRef<FamilyListRow[] | null>(rows);
  const placemarksRef = useRef<Map<string, any>>(new Map());
  const schoolPlacemarkRef = useRef<any>(null);
  const hasFitRef = useRef(false);

  useEffect(() => {
    onSidebarWidthChange?.(sidebarHidden ? SCHOOL_DOCK_HIDDEN_WIDTH : SCHOOL_DOCK_WIDTH);
  }, [onSidebarWidthChange, sidebarHidden]);

  const dockItems = useMemo(() => SCHOOL_TABS.filter(tab => tab.key !== 'ALL').map((tab, index) => ({
    key: tab.key,
    label: tab.label,
    color: SCHOOL_COLORS[index % SCHOOL_COLORS.length],
    logo: tab.logo,
    active: tab.key === schoolKey,
  })), [schoolKey]);

  useEffect(() => {
    fetchV2FamiliesTableCached()
      .then(setRows)
      .catch(() => setRows(prev => prev ?? []));
    fetchV2Branches()
      .then(setBranches)
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    hasFitRef.current = false;
  }, [schoolKey, transferFilter]);

  const schoolBranch = useMemo(() => branches.find(b => b.code === schoolKey), [branches, schoolKey]);

  useEffect(() => {
    let cancelled = false;
    loadYandexMaps()
      .then(ymaps => {
        if (cancelled || !containerRef.current) return;
        ymapsRef.current = ymaps;
        mapRef.current = new ymaps.Map(containerRef.current, {
          center: BISHKEK_CENTER,
          zoom: 11,
          controls: ['zoomControl', 'fullscreenControl'],
        });
        mapRef.current.container.fitToViewport();
        mapRef.current.events.add('click', (e: any) => {
          if (e.get('target') === mapRef.current) {
            mapRef.current?.balloon.close();
          }
        });

        containerRef.current.addEventListener('click', async (event: MouseEvent) => {
          const nameButton = (event.target as HTMLElement).closest('[data-role="open-family"]') as HTMLElement | null;
          if (nameButton) {
            const familyId = nameButton.getAttribute('data-family-id');
            if (familyId) {
              const family = await fetchV2Family(familyId);
              if (family) setOpenFamily(family);
            }
            return;
          }

          const button = (event.target as HTMLElement).closest('[data-role="save"]') as HTMLElement | null;
          if (!button) return;
          const block = button.closest('[data-block]') as HTMLElement | null;
          const childId = block?.getAttribute('data-block');
          const row = childId ? rowsRef.current?.find(r => r.rowId === childId) : undefined;
          if (!row) return;

          const transferInput = block?.querySelector('[data-role="transfer"]') as HTMLSelectElement | null;
          const stopInput = block?.querySelector('[data-role="stop"]') as HTMLSelectElement | null;
          const statusEl = block?.querySelector('[data-role="status"]') as HTMLElement | null;
          const transferValue = transferInput?.value.trim() ?? '';
          const stopValue = stopInput?.value.trim() ?? '';

          button.setAttribute('disabled', 'true');
          if (statusEl) statusEl.textContent = 'Сохраняю…';

          try {
            await updateV2ChildRoute({
              child: {
                id: row.rowId,
                familyId: row.familyId,
                childName: row.childName,
                class: row.childClass,
                selfExitAllowed: false,
                schoolCode: row.schoolCode as any,
                schoolId: row.schoolId ?? undefined,
                branchId: row.branchId ?? undefined,
                zone: row.zone as any,
                vehicleType: row.vehicleType as VehicleType,
              },
              vehicleType: row.vehicleType as VehicleType,
              transferNumber: transferValue ? Number(transferValue) : undefined,
              stopNumber: stopValue ? Number(stopValue) : undefined,
              timeMorning: row.timeMorning ?? undefined,
            });
            setRows(prev => prev?.map(r => (
              r.rowId === childId ? { ...r, transferNumber: transferValue || null, stopNumber: stopValue || null } : r
            )) ?? prev);
            if (statusEl) statusEl.textContent = 'Сохранено ✓';
          } catch (err) {
            if (statusEl) statusEl.textContent = 'Ошибка сохранения';
          } finally {
            button.removeAttribute('disabled');
          }
        });

        setMapReady(true);
      })
      .catch((err: Error) => setError(err.message));
    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
      placemarksRef.current.clear();
      schoolPlacemarkRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !containerRef.current) return;
    const observer = new ResizeObserver(() => mapRef.current?.container.fitToViewport());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [mapReady]);

  const filteredRows = useMemo(() => {
    const baseRows = (rows ?? []).filter(row => row.branchFilter === schoolKey);
    if (transferFilter === 'rejected') {
      return baseRows.filter(row => row.status === 'rejected');
    }
    const activeRows = baseRows.filter(row => row.status !== 'rejected');
    if (!transferFilter) return activeRows;
    if (transferFilter === 'empty') return activeRows.filter(row => !row.transferNumber);
    return activeRows.filter(row => row.transferNumber === transferFilter);
  }, [rows, schoolKey, transferFilter]);

  const pointRows = useMemo<PointRow[]>(
    () => filteredRows.filter((row): row is PointRow => row.latitude != null && row.longitude != null),
    [filteredRows]
  );

  const addressGroups = useMemo(() => {
    const groups = new Map<string, PointRow[]>();
    pointRows.forEach(row => {
      const key = `${row.latitude.toFixed(5)},${row.longitude.toFixed(5)}`;
      const group = groups.get(key);
      if (group) group.push(row);
      else groups.set(key, [row]);
    });
    return Array.from(groups.values());
  }, [pointRows]);

  useEffect(() => {
    const map = mapRef.current;
    const ymaps = ymapsRef.current;
    if (!map || !ymaps) return;

    if (schoolBranch?.latitude != null && schoolBranch?.longitude != null) {
      const coords: [number, number] = [schoolBranch.latitude, schoolBranch.longitude];
      const properties = {
        iconContent: escapeHtml(schoolBranch.shortName || schoolBranch.name),
        balloonContentHeader: escapeHtml(schoolBranch.name),
      };
      if (schoolPlacemarkRef.current) {
        schoolPlacemarkRef.current.geometry.setCoordinates(coords);
        schoolPlacemarkRef.current.properties.set(properties);
      } else {
        schoolPlacemarkRef.current = new ymaps.Placemark(coords, properties, { preset: 'islands#darkOrangeStretchyIcon' });
        map.geoObjects.add(schoolPlacemarkRef.current);
      }
    } else if (schoolPlacemarkRef.current) {
      map.geoObjects.remove(schoolPlacemarkRef.current);
      schoolPlacemarkRef.current = null;
    }

    const isSpecificTransfer = Boolean(transferFilter) && transferFilter !== 'empty' && transferFilter !== 'rejected';

    const nextKeys = new Set<string>();
    addressGroups.forEach(group => {
      const first = group[0];
      const key = `${first.latitude.toFixed(5)},${first.longitude.toFixed(5)}`;
      nextKeys.add(key);
      const iconContent = isSpecificTransfer ? (first.stopNumber ?? '') : (first.transferNumber ?? '');
      const iconColor = isSpecificTransfer
        ? (VEHICLE_COLOR[first.vehicleType] ?? FALLBACK_COLOR)
        : (first.transferNumber ? SCHOOL_COLORS[(Number(first.transferNumber) - 1) % SCHOOL_COLORS.length] : FALLBACK_COLOR);
      const properties = {
        iconContent: iconContent || undefined,
        iconCaption: group.length > 1 ? `×${group.length}` : undefined,
        balloonContentHeader: group.length > 1 ? `${group.length} детей по адресу` : escapeHtml(first.childName),
        balloonContentBody: buildBalloonBody(first.streetAddress, group),
      };
      const options = { preset: 'islands#circleIcon', iconColor };

      const existing = placemarksRef.current.get(key);
      if (existing) {
        existing.properties.set(properties);
        existing.options.set(options);
      } else {
        const placemark = new ymaps.Placemark([first.latitude, first.longitude], properties, options);
        placemarksRef.current.set(key, placemark);
        map.geoObjects.add(placemark);
      }
    });

    placemarksRef.current.forEach((placemark, key) => {
      if (!nextKeys.has(key)) {
        map.geoObjects.remove(placemark);
        placemarksRef.current.delete(key);
      }
    });

    if (!hasFitRef.current && rows !== null && map.geoObjects.getLength() > 0) {
      map.setBounds(map.geoObjects.getBounds(), { checkZoomRange: true, zoomMargin: 48 });
      hasFitRef.current = true;
    }
  }, [addressGroups, schoolBranch, mapReady, rows, transferFilter]);

  if (error) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B91C1C', fontSize: 14, fontWeight: 600 }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', paddingTop: 10 }}>
        <div style={{ flex: 1, minHeight: 0, borderRadius: 16, overflow: 'hidden', background: '#fff', position: 'relative', border: '1px solid #E1E8EA' }}>
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
          {rows !== null && pointRows.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7A859D', fontSize: 14, fontWeight: 600, background: 'rgba(255,255,255,0.85)', pointerEvents: 'none' }}>
              Нет адресов с координатами для отображения
            </div>
          )}
        </div>
      </div>

      <div aria-hidden="true" style={{ width: sidebarHidden ? SCHOOL_DOCK_HIDDEN_WIDTH : SCHOOL_DOCK_WIDTH, flexShrink: 0, transition: 'width .18s ease' }} />

      <SchoolDockSidebar
        items={dockItems}
        hidden={sidebarHidden}
        onHiddenChange={setSidebarHidden}
        onSelect={onSelectSchool}
      />

      {openFamily && (
        <div
          onClick={() => setOpenFamily(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: 'rgba(8, 11, 11, 0.34)',
            backdropFilter: 'blur(3px)',
          }}
        >
          <div onClick={event => event.stopPropagation()} style={{ width: 'min(1240px, calc(100vw - 36px))' }}>
            <InlineFamilyCard
              family={openFamily}
              userRole={userRole}
              userName={userName}
              onUpdated={() => { fetchV2FamiliesTableCached().then(setRows).catch(() => {}); }}
              onClose={() => setOpenFamily(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
