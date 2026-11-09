import { useEffect, useRef, useState } from 'react';
import './SummaryModule.css';
import SummaryNewRequests from './SummaryNewRequests';
import { useFamiliesTable } from '../../hooks/useCrmQueries';
import SchoolDashboardTable from '../families/SchoolDashboardTable';
import { SCHOOL_DIRECTORY } from '../families/constants';
import { useTestTransfers } from '../families/testTransfers';
import { money } from '../../utils/pricing';
import { groupStats, SUMMARY_GROUPS, SUMMARY_SCHOOL_NAMES } from './summaryGroups';

interface Props {
  sessionToken?: string;
  onOpenChild: (familyId: string, childId: string) => void;
}

type Stats = ReturnType<typeof groupStats>;
type SortKey = 'school' | 'newRequests' | 'microbusAverage' | 'microbusCount' | 'lightVehicleCount' | 'debtorsCount' | 'debtSum';
const metrics: { key: Exclude<SortKey, 'school'>; label: string; color: string }[] = [
  { key: 'newRequests', label: 'Новые заявки', color: '#378ADD' },
  { key: 'microbusAverage', label: 'Средний', color: '#2563EB' },
  { key: 'microbusCount', label: 'К-во бус', color: '#7F77DD' },
  { key: 'lightVehicleCount', label: 'К-во легковых', color: '#0F766E' },
  { key: 'debtorsCount', label: 'К-во должников', color: 'var(--danger)' },
  { key: 'debtSum', label: 'Сумма долга', color: 'var(--danger)' },
];
const values = (stats: Stats) => ({ ...stats, microbusAverage: stats.microbusAverage.toFixed(1), debtSum: money(stats.debtSum) });

export default function SummaryModule({ onOpenChild }: Props) {
  const query = useFamiliesTable();
  useTestTransfers();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({ key: 'school', ascending: true });
  const allRows = query.data ?? [];
  const groups = SUMMARY_GROUPS.map(group => ({ ...group, stats: groupStats(allRows.filter(row => group.schools.includes(row.branchFilter))) }));
  const selected = groups.find(group => group.key === selectedKey);
  useEffect(() => {
    if (selectedKey && !dialog.current?.open) dialog.current?.showModal();
  }, [selectedKey]);
  const schools = (selected?.schools ?? []).map(key => {
    const school = SCHOOL_DIRECTORY.find(item => item.key === key);
    return { key, label: school?.label ?? key, stats: groupStats(allRows.filter(row => row.branchFilter === key)) };
  }).sort((a, b) => {
    const comparison = sort.key === 'school' ? a.label.localeCompare(b.label, 'ru') : a.stats[sort.key] - b.stats[sort.key];
    return sort.ascending ? comparison : -comparison;
  });

  if (query.isPending) return <div role="status" style={{ padding: 24 }}>Загрузка сводки…</div>;
  if (query.isError) return <div role="alert" style={{ padding: 24 }}>Не удалось загрузить сводку. <button type="button" className="ow-btn ow-btn--ghost" onClick={() => { void query.refetch(); }}>Повторить</button></div>;

  return <div className="summary-tiles-page">
    <div className="summary-tiles">
      {groups.map((group, index) => <button type="button" key={group.key} className={`summary-tile summary-tile-${index + 1}`} onClick={() => setSelectedKey(group.key)} aria-label={`Открыть ${group.label}`}>
        <div className="summary-tile-heading"><h2>{group.label}</h2><div className="summary-tile-logos">{group.schools.map(key => {
          const school = SCHOOL_DIRECTORY.find(item => item.key === key);
          return school?.logo ? <span className="summary-school-logo" key={key} tabIndex={0}><img src={school.logo} alt={SUMMARY_SCHOOL_NAMES[key] ?? school.label} /><span className="summary-school-tooltip" role="tooltip">{SUMMARY_SCHOOL_NAMES[key] ?? school.label}</span></span> : null;
        })}</div><span aria-hidden="true">→</span></div>
        <p className="summary-tile-team">Менеджер: {group.manager}<br />Логист: {group.logistics}</p>
        <div className="summary-tile-metrics">{metrics.map(metric => <div key={metric.key}><span>{metric.label}</span><strong>{values(group.stats)[metric.key]}</strong></div>)}</div>
        <span className="summary-tile-footer">Школы и показатели →</span>
      </button>)}
    </div>
    <SummaryNewRequests rows={allRows} onOpenChild={onOpenChild} />
    {selected && <dialog ref={dialog} className="summary-dialog" onClose={() => setSelectedKey(null)} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close(); } }} aria-labelledby="summary-dialog-title">
      <header className="summary-dialog-header"><div><h2 id="summary-dialog-title">{selected.label}</h2><p>Менеджер: {selected.manager} · Логист: {selected.logistics}</p></div><button autoFocus type="button" className="ow-btn ow-btn--ghost" onClick={() => dialog.current?.close()}>Закрыть</button></header>
      <SchoolDashboardTable
        commentScope="summary/SummaryModule:schools"
        commentContext={selected.key}
        showAvatars={false}
        columns={[{ key: 'school', label: 'Школы', total: schools.length, color: 'var(--text-2)' }, ...metrics.map(metric => ({ ...metric, total: values(selected.stats)[metric.key] }))]}
        rows={schools.map(school => ({ key: school.key, label: school.label, values: values(school.stats), disabled: true }))}
        sortKey={sort.key}
        ascending={sort.ascending}
        onSort={key => setSort(previous => ({ key: key as SortKey, ascending: previous.key === key ? !previous.ascending : key === 'school' }))}
        onSelect={() => {}}
      />
    </dialog>}
  </div>;
}
