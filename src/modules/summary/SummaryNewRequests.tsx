import { useState } from 'react';
import type { FamilyListRow } from '../../services/crmV2Service';
import TransferCell from '../../core/dashboard/TransferCell';
import { SCHOOL_DIRECTORY } from '../families/constants';
import { isNewUnassignedRow } from '../families/familiesRowHelpers';
import { requestStage } from '../families/requestWorkflow';
import { SUMMARY_GROUPS } from './summaryGroups';

export default function SummaryNewRequests({ rows, onOpenChild }: {
  rows: FamilyListRow[];
  onOpenChild: (familyId: string, childId: string) => void;
}) {
  const [schoolKey, setSchoolKey] = useState('ALL');
  const [search, setSearch] = useState('');
  const schools = SCHOOL_DIRECTORY.filter(school => SUMMARY_GROUPS.some(group => group.schools.includes(school.key)));
  const keys = new Set(schools.map(school => school.key));
  const requests = Array.from(new Map(rows.filter(row => keys.has(row.branchFilter) && isNewUnassignedRow(row) && requestStage(row) === 'new').map(row => [row.rowId, row])).values());
  const searchText = search.trim().toLocaleLowerCase('ru');
  const searchDigits = search.replace(/\D/g, '');
  const visible = requests.filter(row => (schoolKey === 'ALL' || row.branchFilter === schoolKey)
    && (!searchText || row.childName?.toLocaleLowerCase('ru').includes(searchText)
      || (searchDigits.length > 0 && row.phone?.replace(/\D/g, '').includes(searchDigits))))
    .sort((a, b) => {
      const timestamp = (value: string | null) => {
        const time = value ? Date.parse(value) : NaN;
        return Number.isFinite(time) ? time : -Infinity;
      };
      const left = timestamp(a.childCreatedAt);
      const right = timestamp(b.childCreatedAt);
      return left === right ? a.rowId.localeCompare(b.rowId) : left > right ? -1 : 1;
    });
  return <section className="summary-requests" aria-labelledby="summary-requests-title">
    <header className="summary-requests-heading"><h2 id="summary-requests-title">Новые заявки</h2><span>{visible.length}</span></header>
    <div className="summary-school-toolbar">
    <div className="summary-school-bar" role="group" aria-label="Школы новых заявок">
      <TransferCell label="≡" alert value={requests.length} active selected={schoolKey === 'ALL'} title={`Все школы · ${requests.length} новых заявок`} onClick={() => setSchoolKey('ALL')} />
      {schools.map(school => {
        const count = requests.filter(row => row.branchFilter === school.key).length;
        return <TransferCell key={school.key} label={school.label} alert value={count} active={count > 0} selected={schoolKey === school.key} title={`${school.label} · ${count} новых заявок`} onClick={() => setSchoolKey(school.key)} />;
      })}
    </div>
    <input className="summary-requests-search" type="search" aria-label="Поиск новых заявок" placeholder="Поиск: ребёнок, телефон" value={search} onChange={event => setSearch(event.target.value)} />
    </div>
    <div className="summary-requests-table-wrap">
      <table className="summary-requests-table">
        <thead><tr><th scope="col">Ребёнок</th><th scope="col">Телефон</th><th scope="col">Школа</th><th scope="col">Дата заявки</th></tr></thead>
        <tbody>{visible.map(row => <tr key={row.rowId}>
          <td><button type="button" onClick={() => onOpenChild(row.familyId, row.rowId)}>{row.childName || 'Без имени'}</button></td>
          <td>{row.phone || '—'}</td><td>{schools.find(school => school.key === row.branchFilter)?.label}</td>
          <td>{row.childCreatedAt ? new Date(row.childCreatedAt).toLocaleDateString('ru-RU', { timeZone: 'Asia/Bishkek' }) : '—'}</td>
        </tr>)}{!visible.length && <tr><td colSpan={4} className="summary-requests-empty">Нет новых заявок</td></tr>}</tbody>
      </table>
    </div>
  </section>;
}
