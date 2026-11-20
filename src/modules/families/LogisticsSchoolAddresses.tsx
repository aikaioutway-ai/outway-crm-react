import { Map, MapPin, School } from 'lucide-react';
import { useMemo } from 'react';
import { useV2Branches } from '../../hooks/useCrmQueries';
import { getBranchFilter, isSchoolAllowed, isSchoolInTier, SCHOOL_TABS } from './constants';

interface Props {
  allowedSchools?: string[];
  onSelectSchool: (key: string) => void;
}

export default function LogisticsSchoolAddresses({ allowedSchools, onSelectSchool }: Props) {
  const branches = useV2Branches();
  const schools = useMemo(() => (branches.data ?? []).flatMap(branch => {
    const branchNames = [branch.code, branch.shortName, branch.name];
    if (branchNames.some(name => !isSchoolInTier(name, '1.0') || !isSchoolInTier(getBranchFilter(name, branch.code), '1.0'))) {
      return [];
    }
    const key = getBranchFilter(branch.shortName || branch.name, branch.code);
    const school = SCHOOL_TABS.find(tab => tab.key === key && tab.key !== 'ALL');
    if (!school || !isSchoolAllowed(key, allowedSchools)) return [];
    return [{ ...branch, key, label: school.label }];
  }), [branches.data, allowedSchools]);

  if (branches.isPending) return <p role="status">Загрузка школ…</p>;
  if (branches.isError) return <p role="alert">Не удалось загрузить школы.</p>;
  if (schools.length === 0) return <p>Нет доступных школ.</p>;

  return <div className="ow-school-table-wrap logistics-school-addresses">
    <table className="ow-school-table" aria-label="Адреса школ">
      <thead><tr>
        <th scope="col"><span><School size={16} aria-hidden="true" />Школа</span></th>
        <th scope="col"><span><MapPin size={16} aria-hidden="true" />Адрес</span></th>
        <th scope="col"><span><Map size={16} aria-hidden="true" />Карта</span></th>
      </tr></thead>
      <tbody>{schools.map(({ id, key, label, address, latitude, longitude }) => {
        const hasCoordinates = latitude != null && longitude != null;
        return <tr key={id}>
          <td className="is-name"><button type="button" onClick={() => onSelectSchool(key)}>
            <span>{label}</span>
          </button></td>
          <td>{key === 'AES' ? 'ул. Бегматова, 65' : address?.trim() || '—'}</td>
          <td>{hasCoordinates ? <a href={`https://yandex.com/maps/?ll=${longitude},${latitude}&z=17&pt=${longitude},${latitude},pm2rdm`}
            target="_blank" rel="noopener noreferrer">Яндекс Карты</a> : '—'}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
