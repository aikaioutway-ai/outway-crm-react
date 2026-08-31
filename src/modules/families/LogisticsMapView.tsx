import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchV2Branches,
  fetchV2Family,
  updateV2ChildRoute,
  FamilyListRow,
  V2BranchOption,
} from '../../services/crmV2Service';
import { useFamiliesTable } from '../../hooks/useCrmQueries';
import { queryClient, QK } from '../../services/queryClient';
import { Family, VehicleType } from '../../types';
import { loadYandexMaps } from '../../utils/yandexMaps';
import {
  createRouteZone,
  deleteRouteZone,
  fetchRouteZones,
  RouteZone,
  RouteZoneShape,
  updateRouteZone,
} from '../../services/routeZoneService';
import { VEHICLE_COLOR } from './LogisticsSchoolTransferDashboard';
import { SCHOOL_TABS } from './constants';
import { SCHOOL_COLORS } from './LogisticsOverview';
import SchoolDockSidebar, { SCHOOL_DOCK_HIDDEN_WIDTH, SCHOOL_DOCK_WIDTH } from './SchoolDockSidebar';
import InlineFamilyCard from './InlineFamilyCard';

interface LogisticsMapViewProps {
  schoolKey: string;
  transferFilter: string;
  search?: string;
  userRole?: string;
  userName?: string;
  onSelectSchool: (key: string) => void;
  onSidebarWidthChange?: (width: number) => void;
}

type PointRow = FamilyListRow & { latitude: number; longitude: number };

const BISHKEK_CENTER: [number, number] = [42.8746, 74.5698];
const FALLBACK_COLOR = '#626C8B';
const DEFAULT_ZONE_COLOR = '#2AA5A5';
const ZONE_COLORS = ['#2AA5A5', '#5271C4', '#E29B34', '#D85B78', '#7B61C9', '#3A9D65'];

const toolbarButtonStyle = (active = false): React.CSSProperties => ({
  minHeight: 36,
  padding: '7px 12px',
  borderRadius: 9,
  border: active ? '1px solid #249B9D' : '1px solid #D8E3E6',
  background: active ? '#E3F7F6' : '#fff',
  color: active ? '#17777A' : '#273444',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
});

const fieldStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 36,
  border: '1px solid #D8E3E6',
  borderRadius: 9,
  padding: '7px 10px',
  background: '#fff',
  color: '#1C2A38',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

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

export default function LogisticsMapView({ schoolKey, transferFilter, search = '', userRole, userName, onSelectSchool, onSidebarWidthChange }: LogisticsMapViewProps) {
  const { data: rows = null } = useFamiliesTable(false);
  const [branches, setBranches] = useState<V2BranchOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [openFamily, setOpenFamily] = useState<Family | null>(null);
  const [zones, setZones] = useState<RouteZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [zonePanelOpen, setZonePanelOpen] = useState(false);
  const [zoneName, setZoneName] = useState('');
  const [zoneColor, setZoneColor] = useState(DEFAULT_ZONE_COLOR);
  const [zoneOpacity, setZoneOpacity] = useState(0.28);
  const [zoneTransfer, setZoneTransfer] = useState('');
  const [zoneComment, setZoneComment] = useState('');
  const [draftShape, setDraftShape] = useState<RouteZoneShape | null>(null);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [zoneInstruction, setZoneInstruction] = useState('');
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [zoneBusy, setZoneBusy] = useState(false);
  const [zoneRenderVersion, setZoneRenderVersion] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const ymapsRef = useRef<any>(null);
  const rowsRef = useRef<FamilyListRow[] | null>(rows);
  const placemarksRef = useRef<Map<string, any>>(new Map());
  const schoolPlacemarkRef = useRef<any>(null);
  const zoneObjectsRef = useRef<Map<string, any>>(new Map());
  const draftZoneObjectRef = useRef<any>(null);
  const drawModeRef = useRef<RouteZoneShape | null>(null);
  const rectangleStartRef = useRef<[number, number] | null>(null);
  const draftColorRef = useRef(DEFAULT_ZONE_COLOR);
  const draftOpacityRef = useRef(0.28);
  const activeZoneSchoolRef = useRef(schoolKey);
  const hasFitRef = useRef(false);

  useEffect(() => {
    draftColorRef.current = zoneColor;
  }, [zoneColor]);

  useEffect(() => {
    draftOpacityRef.current = zoneOpacity;
  }, [zoneOpacity]);

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
    const placemarks = placemarksRef.current;
    const zoneObjects = zoneObjectsRef.current;
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
          if (drawModeRef.current === 'rectangle' && draftZoneObjectRef.current) {
            const coords = e.get('coords') as [number, number];
            if (!rectangleStartRef.current) {
              rectangleStartRef.current = coords;
              setZoneInstruction('Теперь нажмите на противоположный угол прямоугольника');
            } else {
              const [lat1, lon1] = rectangleStartRef.current;
              const [lat2, lon2] = coords;
              draftZoneObjectRef.current.geometry.setCoordinates([[
                [lat1, lon1],
                [lat1, lon2],
                [lat2, lon2],
                [lat2, lon1],
              ]]);
              drawModeRef.current = null;
              rectangleStartRef.current = null;
              draftZoneObjectRef.current.editor?.startEditing?.();
              setZoneInstruction('Готово. Перетаскивайте точки для правки или нажмите «Сохранить»');
            }
            return;
          }
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
            queryClient.setQueryData<FamilyListRow[]>(QK.familiesTable(false), (prev: FamilyListRow[] | undefined) => prev?.map((r: FamilyListRow) => (
              r.rowId === childId ? { ...r, transferNumber: transferValue || null, stopNumber: stopValue || null } : r
            )) ?? prev);
            if (statusEl) statusEl.textContent = 'Сохранено ✓';
          } catch {
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
      placemarks.clear();
      zoneObjects.clear();
      draftZoneObjectRef.current = null;
      schoolPlacemarkRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !containerRef.current) return;
    const observer = new ResizeObserver(() => mapRef.current?.container.fitToViewport());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [mapReady]);

  useEffect(() => {
    let cancelled = false;
    setZonesLoading(true);
    setZoneError(null);
    setSelectedZoneId(null);
    fetchRouteZones(schoolKey)
      .then(result => {
        if (!cancelled) setZones(result);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setZones([]);
          setZoneError(`Не удалось загрузить зоны: ${err.message}`);
        }
      })
      .finally(() => {
        if (!cancelled) setZonesLoading(false);
      });
    return () => { cancelled = true; };
  }, [schoolKey]);

  useEffect(() => {
    const map = mapRef.current;
    const ymaps = ymapsRef.current;
    if (!map || !ymaps) return;
    const zoneObjects = zoneObjectsRef.current;

    zoneObjects.forEach(object => map.geoObjects.remove(object));
    zoneObjects.clear();

    zones.forEach(zone => {
      const transferLabel = zone.transferNumber ? ` · трансфер ${zone.transferNumber}` : '';
      const polygon = new ymaps.Polygon(
        zone.coordinates,
        {
          hintContent: `${escapeHtml(zone.name)}${transferLabel}`,
          balloonContentHeader: escapeHtml(zone.name),
          balloonContentBody: zone.transferNumber ? `Трансфер №${zone.transferNumber}` : 'Без привязки к трансферу',
        },
        {
          fillColor: zone.fillColor,
          fillOpacity: zone.fillOpacity,
          strokeColor: zone.strokeColor,
          strokeOpacity: 0.95,
          strokeWidth: 3,
          zIndex: 2,
        }
      );
      polygon.events.add('click', () => {
        setSelectedZoneId(zone.id);
        setZonePanelOpen(true);
      });
      zoneObjects.set(zone.id, polygon);
      map.geoObjects.add(polygon);
    });

    return () => {
      zoneObjects.forEach(object => map.geoObjects.remove(object));
      zoneObjects.clear();
    };
  }, [mapReady, schoolKey, zoneRenderVersion, zones]);

  useEffect(() => {
    const draft = draftZoneObjectRef.current;
    if (!draft) return;
    draft.options.set({
      fillColor: zoneColor,
      fillOpacity: zoneOpacity,
      strokeColor: zoneColor,
    });
  }, [zoneColor, zoneOpacity]);

  const removeDraftObject = (rerenderSaved: boolean) => {
    const draft = draftZoneObjectRef.current;
    if (draft) {
      draft.editor?.stopDrawing?.();
      draft.editor?.stopEditing?.();
      mapRef.current?.geoObjects.remove(draft);
    }
    draftZoneObjectRef.current = null;
    drawModeRef.current = null;
    rectangleStartRef.current = null;
    if (rerenderSaved) setZoneRenderVersion(value => value + 1);
  };

  const resetZoneForm = () => {
    setDraftShape(null);
    setEditingZoneId(null);
    setZoneName('');
    setZoneColor(DEFAULT_ZONE_COLOR);
    setZoneOpacity(0.28);
    setZoneTransfer('');
    setZoneComment('');
    setZoneInstruction('');
    setZoneError(null);
  };

  const cancelZoneDraft = () => {
    removeDraftObject(Boolean(editingZoneId));
    resetZoneForm();
  };

  const startNewZone = (shape: RouteZoneShape) => {
    const map = mapRef.current;
    const ymaps = ymapsRef.current;
    if (!map || !ymaps) {
      setZoneError('Карта ещё загружается');
      return;
    }

    removeDraftObject(Boolean(editingZoneId));
    const polygon = new ymaps.Polygon([], {}, {
      fillColor: draftColorRef.current,
      fillOpacity: draftOpacityRef.current,
      strokeColor: draftColorRef.current,
      strokeOpacity: 1,
      strokeWidth: 3,
      editorDrawingCursor: 'crosshair',
      editorMaxPoints: 60,
      zIndex: 10,
    });
    map.geoObjects.add(polygon);
    draftZoneObjectRef.current = polygon;
    drawModeRef.current = shape;
    rectangleStartRef.current = null;
    setDraftShape(shape);
    setEditingZoneId(null);
    setSelectedZoneId(null);
    setZoneError(null);
    setZonePanelOpen(true);
    setZoneName(`Зона ${zones.length + 1}`);

    if (shape === 'polygon') {
      polygon.editor.startDrawing();
      setZoneInstruction('Ставьте точки по границе зоны. Когда закончите — нажмите «Сохранить»');
    } else {
      setZoneInstruction('Нажмите на карте первый угол прямоугольника');
    }
  };

  const startEditingZone = (zone: RouteZone) => {
    const polygon = zoneObjectsRef.current.get(zone.id);
    if (!polygon) return;
    removeDraftObject(Boolean(editingZoneId));
    draftZoneObjectRef.current = polygon;
    setDraftShape(zone.shapeType);
    setEditingZoneId(zone.id);
    setSelectedZoneId(zone.id);
    setZoneName(zone.name);
    setZoneColor(zone.fillColor);
    setZoneOpacity(zone.fillOpacity);
    setZoneTransfer(zone.transferNumber ? String(zone.transferNumber) : '');
    setZoneComment(zone.comment);
    setZoneError(null);
    setZoneInstruction('Перетаскивайте точки зоны, затем нажмите «Сохранить»');
    polygon.editor?.startEditing?.();
  };

  const saveZone = async () => {
    const polygon = draftZoneObjectRef.current;
    if (!polygon || !draftShape) return;
    polygon.editor?.stopDrawing?.();
    polygon.editor?.stopEditing?.();
    const coordinates = polygon.geometry.getCoordinates() as number[][][];
    if (!coordinates?.[0] || coordinates[0].length < 3) {
      setZoneError(draftShape === 'rectangle'
        ? 'Укажите два противоположных угла прямоугольника'
        : 'Поставьте на карте минимум три точки');
      if (draftShape === 'polygon') polygon.editor?.startDrawing?.();
      return;
    }

    setZoneBusy(true);
    setZoneError(null);
    try {
      const input = {
        schoolKey,
        name: zoneName.trim() || `Зона ${zones.length + 1}`,
        shapeType: draftShape,
        coordinates,
        fillColor: zoneColor,
        strokeColor: zoneColor,
        fillOpacity: zoneOpacity,
        transferNumber: zoneTransfer ? Number(zoneTransfer) : null,
        comment: zoneComment,
        createdBy: userName,
      };
      const saved = editingZoneId
        ? await updateRouteZone(editingZoneId, input)
        : await createRouteZone(input);
      mapRef.current?.geoObjects.remove(polygon);
      draftZoneObjectRef.current = null;
      drawModeRef.current = null;
      rectangleStartRef.current = null;
      setZones(current => editingZoneId
        ? current.map(zone => zone.id === editingZoneId ? saved : zone)
        : [...current, saved]);
      setSelectedZoneId(saved.id);
      resetZoneForm();
    } catch (err) {
      setZoneError(err instanceof Error ? err.message : 'Не удалось сохранить зону');
      polygon.editor?.startEditing?.();
    } finally {
      setZoneBusy(false);
    }
  };

  const removeZone = async (zone: RouteZone) => {
    if (!window.confirm(`Удалить зону «${zone.name}»?`)) return;
    setZoneBusy(true);
    setZoneError(null);
    try {
      if (editingZoneId === zone.id) removeDraftObject(false);
      await deleteRouteZone(zone.id);
      setZones(current => current.filter(item => item.id !== zone.id));
      if (selectedZoneId === zone.id) setSelectedZoneId(null);
      if (editingZoneId === zone.id) resetZoneForm();
    } catch (err) {
      setZoneError(err instanceof Error ? err.message : 'Не удалось удалить зону');
    } finally {
      setZoneBusy(false);
    }
  };

  useEffect(() => {
    if (activeZoneSchoolRef.current === schoolKey) return;
    activeZoneSchoolRef.current = schoolKey;
    removeDraftObject(false);
    resetZoneForm();
  }, [schoolKey]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase().replace(/\s+/g, '');
    const baseRows = (rows ?? []).filter(row => row.branchFilter === schoolKey && (!query || [row.parentName, row.childName, row.phone, row.streetAddress]
      .some(value => String(value ?? '').toLowerCase().replace(/\s+/g, '').includes(query))));
    if (transferFilter === 'rejected') {
      return baseRows.filter(row => row.status === 'rejected');
    }
    const activeRows = baseRows.filter(row => row.status !== 'rejected');
    if (!transferFilter) return activeRows;
    if (transferFilter === 'empty') return activeRows.filter(row => !row.transferNumber);
    return activeRows.filter(row => row.transferNumber === transferFilter);
  }, [rows, schoolKey, search, transferFilter]);

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
          <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 25 }}>
            <button
              type="button"
              onClick={() => setZonePanelOpen(open => !open)}
              style={{
                ...toolbarButtonStyle(zonePanelOpen),
                minWidth: 112,
                boxShadow: '0 5px 18px rgba(29, 55, 68, 0.16)',
              }}
            >
              ◇ Зоны {zones.length > 0 ? `(${zones.length})` : ''}
            </button>

            {zonePanelOpen && (
              <div style={{
                width: 340,
                maxHeight: 'calc(100vh - 250px)',
                overflowY: 'auto',
                marginTop: 8,
                padding: 14,
                border: '1px solid #DCE6E8',
                borderRadius: 14,
                background: 'rgba(255,255,255,0.97)',
                boxShadow: '0 14px 36px rgba(25, 48, 60, 0.2)',
                backdropFilter: 'blur(8px)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ color: '#17222F', fontSize: 15, fontWeight: 800 }}>Зоны маршрута</div>
                    <div style={{ marginTop: 2, color: '#7A859D', fontSize: 11 }}>Школа: {schoolBranch?.shortName || schoolKey}</div>
                  </div>
                  <button type="button" aria-label="Закрыть зоны" onClick={() => setZonePanelOpen(false)} style={{ ...toolbarButtonStyle(), minHeight: 30, padding: '3px 9px' }}>×</button>
                </div>

                {!draftShape ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
                      <button type="button" onClick={() => startNewZone('polygon')} style={toolbarButtonStyle()}>
                        ⬡ Многоугольник
                      </button>
                      <button type="button" onClick={() => startNewZone('rectangle')} style={toolbarButtonStyle()}>
                        ▭ Прямоугольник
                      </button>
                    </div>

                    <div style={{ marginTop: 15, paddingTop: 12, borderTop: '1px solid #E4ECEE' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#59677A', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        <span>Сохранённые зоны</span>
                        <span>{zones.length}</span>
                      </div>
                      {zonesLoading ? (
                        <div style={{ padding: '18px 0', color: '#7A859D', fontSize: 13, textAlign: 'center' }}>Загрузка…</div>
                      ) : zones.length === 0 ? (
                        <div style={{ padding: '18px 10px 8px', color: '#7A859D', fontSize: 12, lineHeight: 1.45, textAlign: 'center' }}>
                          Пока зон нет. Выберите фигуру выше и нарисуйте её на карте.
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gap: 7, marginTop: 9 }}>
                          {zones.map(zone => (
                            <div
                              key={zone.id}
                              onClick={() => setSelectedZoneId(zone.id)}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '10px minmax(0, 1fr) auto',
                                alignItems: 'center',
                                gap: 9,
                                padding: '9px 9px',
                                border: selectedZoneId === zone.id ? '1px solid #62BFC0' : '1px solid #E1E8EA',
                                borderRadius: 10,
                                background: selectedZoneId === zone.id ? '#F0FAF9' : '#fff',
                                cursor: 'pointer',
                              }}
                            >
                              <span style={{ width: 10, height: 28, borderRadius: 5, background: zone.fillColor }} />
                              <span style={{ minWidth: 0 }}>
                                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#253342', fontSize: 13, fontWeight: 750 }}>{zone.name}</span>
                                <span style={{ display: 'block', marginTop: 2, color: '#7A859D', fontSize: 11 }}>
                                  {zone.shapeType === 'rectangle' ? 'Прямоугольник' : 'Многоугольник'}{zone.transferNumber ? ` · Трансфер ${zone.transferNumber}` : ''}
                                </span>
                              </span>
                              <span style={{ display: 'flex', gap: 4 }}>
                                <button type="button" title="Редактировать" onClick={event => { event.stopPropagation(); startEditingZone(zone); }} style={{ ...toolbarButtonStyle(), minHeight: 30, padding: '3px 8px' }}>✎</button>
                                <button type="button" title="Удалить" disabled={zoneBusy} onClick={event => { event.stopPropagation(); void removeZone(zone); }} style={{ ...toolbarButtonStyle(), minHeight: 30, padding: '3px 8px', color: '#B64848' }}>×</button>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                    <div style={{ padding: '9px 10px', borderRadius: 9, background: '#EAF8F7', color: '#39777A', fontSize: 12, lineHeight: 1.4 }}>
                      {zoneInstruction}
                    </div>

                    <label style={{ color: '#59677A', fontSize: 11, fontWeight: 800 }}>
                      НАЗВАНИЕ
                      <input value={zoneName} onChange={event => setZoneName(event.target.value)} placeholder="Например, Восточная зона" style={{ ...fieldStyle, marginTop: 5 }} />
                    </label>

                    <label style={{ color: '#59677A', fontSize: 11, fontWeight: 800 }}>
                      ТРАНСФЕР
                      <select value={zoneTransfer} onChange={event => setZoneTransfer(event.target.value)} style={{ ...fieldStyle, marginTop: 5 }}>
                        <option value="">Без привязки</option>
                        {TRANSFER_SELECT_OPTIONS.map(value => <option key={value} value={value}>Трансфер №{value}</option>)}
                      </select>
                    </label>

                    <div>
                      <div style={{ color: '#59677A', fontSize: 11, fontWeight: 800 }}>ЦВЕТ ЗАЛИВКИ</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7 }}>
                        {ZONE_COLORS.map(color => (
                          <button
                            type="button"
                            key={color}
                            aria-label={`Цвет ${color}`}
                            onClick={() => setZoneColor(color)}
                            style={{ width: 27, height: 27, borderRadius: 8, border: zoneColor === color ? '3px solid #17222F' : '2px solid #fff', boxShadow: '0 0 0 1px #CBD7DA', background: color, cursor: 'pointer' }}
                          />
                        ))}
                        <input aria-label="Свой цвет зоны" type="color" value={zoneColor} onChange={event => setZoneColor(event.target.value)} style={{ width: 31, height: 29, padding: 1, border: '1px solid #CBD7DA', borderRadius: 8, background: '#fff', cursor: 'pointer' }} />
                      </div>
                    </div>

                    <label style={{ color: '#59677A', fontSize: 11, fontWeight: 800 }}>
                      ПРОЗРАЧНОСТЬ · {Math.round(zoneOpacity * 100)}%
                      <input type="range" min="0.1" max="0.65" step="0.05" value={zoneOpacity} onChange={event => setZoneOpacity(Number(event.target.value))} style={{ width: '100%', marginTop: 7, accentColor: zoneColor }} />
                    </label>

                    <label style={{ color: '#59677A', fontSize: 11, fontWeight: 800 }}>
                      КОММЕНТАРИЙ
                      <textarea value={zoneComment} onChange={event => setZoneComment(event.target.value)} rows={2} placeholder="Необязательно" style={{ ...fieldStyle, marginTop: 5, resize: 'vertical' }} />
                    </label>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 8 }}>
                      <button type="button" onClick={cancelZoneDraft} disabled={zoneBusy} style={toolbarButtonStyle()}>Отмена</button>
                      <button type="button" onClick={() => void saveZone()} disabled={zoneBusy} style={{ ...toolbarButtonStyle(true), background: '#2AA5A5', borderColor: '#2AA5A5', color: '#fff' }}>
                        {zoneBusy ? 'Сохраняю…' : editingZoneId ? 'Сохранить' : 'Создать зону'}
                      </button>
                    </div>
                  </div>
                )}

                {zoneError && (
                  <div role="alert" style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: '#FFF0F0', color: '#B64848', fontSize: 12, lineHeight: 1.4 }}>
                    {zoneError}
                  </div>
                )}
              </div>
            )}
          </div>
          {rows !== null && pointRows.length === 0 && (
            <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 12, padding: '9px 14px', borderRadius: 10, color: '#667389', fontSize: 12, fontWeight: 700, background: 'rgba(255,255,255,0.92)', boxShadow: '0 4px 16px rgba(29,55,68,.12)', pointerEvents: 'none' }}>
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
              onClose={() => setOpenFamily(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
