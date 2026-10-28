import React, { useState } from 'react';
import { FamilySearchHit } from '../../services/crmV2Service';
import { ManagerSearch } from '../families/ManagerOverview';

export default function CompensationChildSearch({ onSelect }: { onSelect: (row: FamilySearchHit) => Promise<void> }) {
  const [error, setError] = useState('');
  return <div className="compensation-child-search"><ManagerSearch onOpenFamily={(_school, _family, _query, row) => {
    setError('');
    void onSelect(row).catch(() => setError('Не удалось открыть карточку клиента.'));
  }} />{error && <p role="alert">{error}</p>}</div>;
}
