import React, { useState } from 'react';
import { Download } from 'lucide-react';
export default function TableDownloadButton({ onDownload }: { onDownload: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <><button type="button" className="dt-btn dt-btn--icon" disabled={busy} title={busy ? 'Подготовка Excel…' : 'Скачать таблицу в Excel'} aria-label="Скачать таблицу в Excel" onClick={async event => {
    event.stopPropagation(); if (busy) return;
    setBusy(true); setError('');
    try { await onDownload(); } catch { setError('Не удалось скачать таблицу. Попробуйте ещё раз.'); } finally { setBusy(false); }
  }}><Download size={15} strokeWidth={1.75} aria-hidden="true"/></button>{error && <span className="dt-export-error" role="alert">{error}</span>}</>;
}
