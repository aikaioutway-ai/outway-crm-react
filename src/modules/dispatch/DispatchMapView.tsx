import { useEffect, useRef, useState } from 'react';
import { loadYandexMaps } from '../../utils/yandexMaps';
import { fetchRunStops, TransferRunStop } from '../../services/transferRunService';
import { supabase } from '../../services/supabase';

interface DispatchMapViewProps {
  runId: string;
  transferNumber: number;
}

const BISHKEK_CENTER: [number, number] = [42.8746, 74.5698];
const POLL_MS = 15_000;

const STATUS_PRESET: Record<string, string> = {
  pending: 'islands#grayDotIcon',
  notified_5min: 'islands#yellowDotIcon',
  arrived: 'islands#blueDotIcon',
  done: 'islands#greenDotIcon',
  skipped: 'islands#redDotIcon',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Ожидает',
  notified_5min: 'Будет через 5 мин',
  arrived: 'Водитель на месте',
  done: 'Забрали',
  skipped: 'Не забрали',
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#9AA5B8',
  notified_5min: '#BA7517',
  arrived: '#1D6FA4',
  done: 'var(--success)',
  skipped: '#EF7168',
};

export default function DispatchMapView({ runId, transferNumber }: DispatchMapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const driverPlacemarkRef = useRef<any>(null);
  const stopPlacemarksRef = useRef<any[]>([]);
  const [stops, setStops] = useState<TransferRunStop[]>([]);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lon: number; at: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRunStops(runId).then(data => { if (!cancelled) setStops(data); }).catch(() => { if (!cancelled) setStops([]); });
    return () => { cancelled = true; };
  }, [runId]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      supabase
        .from('v2_transfer_runs')
        .select('last_latitude, last_longitude, last_location_at')
        .eq('id', runId)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled || !data || data.last_latitude == null || data.last_longitude == null) return;
          setDriverLocation({ lat: Number(data.last_latitude), lon: Number(data.last_longitude), at: data.last_location_at });
        });
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [runId]);

  useEffect(() => {
    let cancelled = false;
    loadYandexMaps()
      .then(ymaps => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new ymaps.Map(containerRef.current, {
          center: BISHKEK_CENTER,
          zoom: 12,
          controls: ['zoomControl', 'fullscreenControl'],
        });
      })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; mapRef.current?.destroy?.(); };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const w = window as any;
    if (!map || !w.ymaps) return;
    stopPlacemarksRef.current.forEach(pm => map.geoObjects.remove(pm));
    stopPlacemarksRef.current = stops.map(stop => {
      const placemark = new w.ymaps.Placemark(
        [stop.latitude, stop.longitude],
        { balloonContent: `${stop.childName} · ${STATUS_LABEL[stop.status] ?? stop.status}<br/>${stop.address}` },
        { preset: STATUS_PRESET[stop.status] ?? 'islands#blueDotIcon' },
      );
      map.geoObjects.add(placemark);
      return placemark;
    });
  }, [stops]);

  useEffect(() => {
    const map = mapRef.current;
    const w = window as any;
    if (!map || !w.ymaps || !driverLocation) return;
    if (driverPlacemarkRef.current) map.geoObjects.remove(driverPlacemarkRef.current);
    driverPlacemarkRef.current = new w.ymaps.Placemark(
      [driverLocation.lat, driverLocation.lon],
      { balloonContent: `Водитель · трансфер #${transferNumber}` },
      { preset: 'islands#darkOrangeStretchyIcon' },
    );
    map.geoObjects.add(driverPlacemarkRef.current);
    map.setCenter([driverLocation.lat, driverLocation.lon]);
  }, [driverLocation, transferNumber]);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12 }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative', background: '#fff', borderRadius: 14, overflow: 'hidden' }}>
        {error ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#7A859D' }}>{error}</div>
        ) : (
          <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
        )}
      </div>
      <div style={{ width: 280, flexShrink: 0, background: '#fff', borderRadius: 14, padding: 12, overflowY: 'auto' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Трансфер #{transferNumber}</div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>
          {driverLocation ? `Последняя точка: ${new Date(driverLocation.at ?? '').toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek' })}` : 'Водитель ещё не поделился геолокацией'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase' }}>Дети в рейсе</div>
          {stops.length > 0 && (
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>
              {stops.filter(s => s.status === 'done' || s.status === 'skipped').length} / {stops.length}
            </div>
          )}
        </div>
        {stops.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Список ещё не сформирован</div>
        ) : (
          stops.map(stop => (
            <div key={stop.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border-light, #eee)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[stop.status] ?? '#9AA5B8', marginTop: 5, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{stop.childName}</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{stop.address}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[stop.status] ?? '#9AA5B8' }}>{STATUS_LABEL[stop.status] ?? stop.status}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
