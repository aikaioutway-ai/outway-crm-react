import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, X } from 'lucide-react';
import { useB2BClients, useB2BDriverPayouts, useB2BExpenses, useB2BOrders } from '../../hooks/useB2BData';
import useB2BPayments from '../../hooks/useB2BPayments';
import { B2BExportTab, downloadB2BExcel, getB2BExportRowCount } from './b2bExcelWorkbook';

interface B2BExcelExportProps {
  activeTab: B2BExportTab;
  label: string;
}

const localDate = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export default function B2BExcelExport({ activeTab, label }: B2BExcelExportProps) {
  const [open, setOpen] = useState(false);

  return <>
    <button type="button" className="b2b-export-button" onClick={() => setOpen(true)}><FileSpreadsheet size={17} />Экспорт Excel</button>
    {open && <B2BExcelExportDialog activeTab={activeTab} label={label} onClose={() => setOpen(false)} />}
  </>;
}

function B2BExcelExportDialog({ activeTab, label, onClose }: B2BExcelExportProps & { onClose: () => void }) {
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(() => localDate(today.getFullYear(), 1, 1));
  const [dateTo, setDateTo] = useState(() => localDate(today.getFullYear(), 12, 31));
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const { data: orders = [] } = useB2BOrders();
  const { data: clients = [] } = useB2BClients();
  const { data: payouts = [] } = useB2BDriverPayouts();
  const { data: expenses = [] } = useB2BExpenses();
  const payments = useB2BPayments();
  const data = useMemo(() => ({ orders, clients, payments, payouts, expenses }), [clients, expenses, orders, payments, payouts]);
  const rowCount = useMemo(() => {
    if (dateFrom > dateTo) return 0;
    try {
      return getB2BExportRowCount(activeTab, data, dateFrom, dateTo);
    } catch {
      return 0;
    }
  }, [activeTab, data, dateFrom, dateTo]);

  const download = async () => {
    if (dateFrom > dateTo) return setError('Дата начала не может быть позже даты окончания.');
    setDownloading(true);
    setError('');
    try {
      await downloadB2BExcel(activeTab, label, data, dateFrom, dateTo);
      onClose();
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Не удалось сформировать Excel-файл.');
    } finally {
      setDownloading(false);
    }
  };

  return <div className="b2b-modal-overlay b2b-export-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !downloading) onClose(); }}>
      <div className="b2b-export-modal" role="dialog" aria-modal="true" aria-labelledby="b2b-export-title">
        <div className="b2b-modal-head"><div><h2 id="b2b-export-title">Экспорт: {label}</h2><p>Выберите фактический период данных</p></div><button type="button" onClick={onClose} disabled={downloading} aria-label="Закрыть"><X size={18} /></button></div>
        <div className="b2b-export-body">
          <div className="b2b-export-period"><label><span>Дата начала *</span><input type="date" value={dateFrom} onChange={event => { setDateFrom(event.target.value); setError(''); }} /></label><label><span>Дата окончания *</span><input type="date" value={dateTo} onChange={event => { setDateTo(event.target.value); setError(''); }} /></label></div>
          <div className="b2b-export-preview"><FileSpreadsheet size={22} /><div><strong>{rowCount} строк для выгрузки</strong><span>{activeTab === 'cashier' || activeTab === 'cashflow' ? 'В файле будут страницы «Поступления» и «Выплаты».' : activeTab === 'clients' ? 'Клиенты выгружаются полностью, показатели считаются за выбранный период.' : 'В файл попадут записи выбранного периода.'}</span></div></div>
          <div className="b2b-export-note"><strong>Для последующего исправления базы</strong><span>Можно менять даты, суммы и описания. Не изменяйте колонки ID.</span></div>
          {error && <div className="b2b-form-error" role="alert">{error}</div>}
          <div className="b2b-form-actions"><button type="button" className="b2b-cancel-button" onClick={onClose} disabled={downloading}>Отмена</button><button type="button" className="b2b-primary-button" onClick={() => void download()} disabled={downloading || !dateFrom || !dateTo}><Download size={16} />{downloading ? 'Формирование…' : 'Скачать Excel'}</button></div>
        </div>
      </div>
    </div>;
}
