import { useEffect, useRef, useState } from 'react';
import { fetchV2Branches } from '../../services/crmV2Service';
import { loadYandexMaps } from '../../utils/yandexMaps';
import { isSchoolAllowed, isSchoolVisible, SCHOOL_TABS, SCHOOL_TIER_2_KEYS } from './constants';

export default function SchoolsMap({ allowedSchools, onSelectSchool }: { allowedSchools?: string[]; onSelectSchool: (key: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState('Загрузка карты школ…');
  useEffect(() => {
    let cancelled = false;
    let map: any;
    Promise.all([loadYandexMaps(), fetchV2Branches()]).then(([ymaps, branches]) => {
      if (cancelled || !container.current) return;
      map = new ymaps.Map(container.current, { center: [42.8746, 74.5698], zoom: 11, controls: ['zoomControl', 'fullscreenControl'] });
      const markerLayout = ymaps.templateLayoutFactory.createClass(
        '<div style="position:absolute;left:-64px;top:-44px;width:128px;height:34px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:7px;padding:0 9px;border:2px solid {{properties.markerColor}};border-radius:10px;background:#fff;box-shadow:0 3px 10px rgba(25,45,65,.18);cursor:pointer">' +
        '<span style="width:9px;height:9px;flex-shrink:0;border-radius:50%;background:{{properties.markerColor}}"></span>' +
        '<span style="font:700 12px/16px Arial,sans-serif;color:#243244;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{properties.iconContent}}</span>' +
        '<span style="position:absolute;left:55px;bottom:-10px;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid {{properties.markerColor}}"></span></div>'
      );
      const schools = branches.filter(school => isSchoolVisible(school.shortName) && isSchoolVisible(school.name) && isSchoolAllowed(school.code, allowedSchools) && !SCHOOL_TIER_2_KEYS.includes(school.code) && school.latitude != null && school.longitude != null);
      const colors = ['#2563EB', '#7C3AED', '#059669', '#E11D48', '#D97706', '#0891B2', '#4F46E5', '#C026D3', '#65A30D', '#EA580C', '#0D9488', '#9333EA', '#DC2626', '#0284C7', '#16A34A', '#DB2777'];
      schools.forEach(school => {
        const index = SCHOOL_TABS.findIndex(tab => tab.key === school.code);
        const color = colors[(index >= 0 ? index : school.code.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % colors.length];
        const marker = new ymaps.Placemark([school.latitude, school.longitude], { iconContent: school.shortName || school.name, hintContent: school.name, markerColor: color }, { iconLayout: markerLayout, iconShape: { type: 'Rectangle', coordinates: [[-64, -44], [64, 0]] }, hideIconOnBalloonOpen: false });
        marker.events.add('click', () => onSelectSchool(school.code));
        map.geoObjects.add(marker);
      });
      const bounds = map.geoObjects.getBounds();
      if (bounds) map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 50 });
      setMessage(schools.length ? '' : 'У школ пока не указаны координаты');
    }).catch(() => { if (!cancelled) setMessage('Не удалось загрузить карту школ'); });
    return () => { cancelled = true; map?.destroy(); };
  }, [allowedSchools, onSelectSchool]);
  return <div style={{ flex: 1, minHeight: 300, position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
    <div ref={container} style={{ height: '100%', width: '100%', position: 'absolute', inset: 0 }} />
    {message && <div role="status" style={{ position: 'absolute', top: 16, left: 16, background: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>{message}</div>}
  </div>;
}
