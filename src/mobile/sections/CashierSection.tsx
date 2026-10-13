import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { usePaymentsTable, useRefundsTable } from '../../hooks/useCrmQueries';
import { CASHIER_PERIODS, currentCashierPeriodKey, getBranchFilter, isSchoolAllowed } from '../../modules/families/constants';
import { compactMoney, paymentRowMatchesPeriod } from '../../modules/families/familiesRowHelpers';
import { CashierPaymentRow, fetchCashierPaymentsTable, PaymentTableRow, RefundTableRow } from '../../services/crmV2Service';
import { AuthenticatedUser } from '../../services/employeeService';
import { confirmFamilyPayment, updateFamilyPayment } from '../../services/financeService';
import { QK } from '../../services/queryClient';
import { formatName, formatPhone, phoneMatchesQuery } from '../../utils/format';
import { money } from '../../utils/pricing';
import FamilySheet from '../FamilySheet';
import { Screen, useNavPosition } from '../nav';
import { Badge, Chips, Empty, ErrorBox, formatDate, InfoRow, Kpi, PhoneRow, SearchField, Segment, Sheet, Skeletons, todayIso, useIncremental } from '../ui';

type CashierTab = 'pending' | 'confirmed' | 'refunds';

const METHOD_LABEL: Record<string, string> = { cash: 'Наличные', transfer: 'АйКай Мбанк', cashless: 'Безналичные' };
const REFUND_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'На проверке', bg: '#FEF3C7', color: '#92400E' },
  confirmed: { label: 'Подтверждено', bg: '#DCFCE7', color: '#166534' },
  rejected: { label: 'Отклонено', bg: '#FEE2E2', color: '#991B1B' },
};

type MoneyRow = Pick<PaymentTableRow, 'id' | 'familyId' | 'parentName' | 'phone' | 'childrenNames' | 'branchShort' | 'transferNumber' | 'amount'>;

function isConfirmedPaymentStatus(status: string): boolean {
  const lower = String(status ?? '').toLowerCase();
  return lower === 'paid' || lower === 'confirmed' || lower.includes('оплач') || lower.includes('подтверж');
}

/** «Все месяцы» — как в полной версии: только месяцы текущего учебного сезона. */
function matchesPeriod(row: Pick<PaymentTableRow, 'paymentDate' | 'actualPaymentDate' | 'createdAt'>, periodKey: string): boolean {
  if (periodKey === 'ALL') return CASHIER_PERIODS.some(period => paymentRowMatchesPeriod(row, period.key));
  return paymentRowMatchesPeriod(row, periodKey);
}

const PERIOD_OPTIONS = [
  { value: 'ALL', label: 'Все месяцы' },
  ...CASHIER_PERIODS.map(period => ({ value: period.key, label: period.label })),
];

function schoolKeyOf(row: MoneyRow): string {
  return getBranchFilter(row.branchShort, row.branchShort) || row.branchShort;
}

function moneyRowMatches(row: MoneyRow, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (phoneMatchesQuery(q, row.phone)) return true;
  const needle = q.toLowerCase().replace(/\s+/g, '');
  return [row.parentName, row.childrenNames, row.branchShort, row.transferNumber]
    .some(value => String(value ?? '').toLowerCase().replace(/\s+/g, '').includes(needle));
}

function MoneyCard({ row, date, extra, onClick }: { row: MoneyRow; date?: string | null; extra?: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="m-card" onClick={onClick}>
      <div className="m-card-row" style={{ alignItems: 'flex-start' }}>
        <div className="m-card-main">
          <div className="m-card-title">{formatName(row.parentName) || 'Без имени'}</div>
          <div className="m-card-sub">{[row.childrenNames, formatPhone(row.phone)].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="m-card-end">
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent-h)' }}>{money(row.amount)}</div>
          {date && <div className="m-card-sub">{formatDate(date)}</div>}
        </div>
      </div>
      <div className="m-card-meta">
        {row.branchShort && <Badge>{row.branchShort}</Badge>}
        {row.transferNumber && <Badge tone={{ bg: '#E0F0FF', color: '#1D4ED8' }}>№{row.transferNumber}</Badge>}
        {extra}
      </div>
    </button>
  );
}

function MoneyList<T extends MoneyRow>({ rows, render }: { rows: T[]; render: (row: T) => React.ReactNode }) {
  const [visible, sentinelRef] = useIncremental(rows);
  if (!rows.length) return <Empty>Ничего не найдено</Empty>;
  return (
    <div className="m-list">
      {visible.map(row => <React.Fragment key={row.id}>{render(row)}</React.Fragment>)}
      <div ref={sentinelRef} className="m-more" />
    </div>
  );
}

function PendingPaymentSheet({ row, userName, onClose, onOpenFamily }: {
  row: CashierPaymentRow;
  userName: string;
  onClose: () => void;
  onOpenFamily: () => void;
}) {
  const [date, setDate] = useState(row.actualPaymentDate?.slice(0, 10) || row.paymentDate?.slice(0, 10) || todayIso());
  const [busy, setBusy] = useState<'confirm' | 'reject' | null>(null);
  const [error, setError] = useState('');

  const confirm = async () => {
    if (!date) { setError('Укажите дату поступления'); return; }
    setBusy('confirm');
    setError('');
    try {
      await confirmFamilyPayment({
        payment: { id: row.id, familyId: row.familyId, amount: row.amount, paymentType: (row.paymentMethod ?? 'cash') as 'cash', paymentDate: row.paymentDate ?? '', status: 'На проверке', createdAt: row.createdAt },
        charges: [],
        confirmedBy: userName,
        actualPaymentDate: date,
      });
      onClose();
    } catch (reason) {
      setError(`Не удалось подтвердить: ${reason instanceof Error ? reason.message : ''}`);
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    if (!window.confirm(`Отклонить платёж ${money(row.amount)} от «${formatName(row.parentName)}»?`)) return;
    setBusy('reject');
    setError('');
    try {
      await updateFamilyPayment(row.id, { status: 'Отклонено' });
      onClose();
    } catch (reason) {
      setError(`Не удалось отклонить: ${reason instanceof Error ? reason.message : ''}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet title={`Платёж ${money(row.amount)}`} onClose={onClose}>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="m-info">
        <InfoRow label="Родитель" value={row.parentName} />
        <PhoneRow label="Телефон" phone={row.phone} />
        <InfoRow label="Дети" value={row.childrenNames} />
        <InfoRow label="Школа и трансфер" value={[row.branchShort, row.transferNumber ? `№${row.transferNumber}` : ''].filter(Boolean).join(' · ')} />
      </div>
      <div className="m-info">
        <InfoRow label="Способ оплаты" value={METHOD_LABEL[row.paymentMethod ?? ''] ?? row.paymentMethod} />
        <InfoRow label="Дата оплаты (по словам родителя)" value={formatDate(row.paymentDate)} />
        {row.comment && <InfoRow label="Комментарий" value={row.comment} />}
        {row.receiptUrl && (
          <InfoRow
            label="Чек"
            value="Открыть чек"
            action={<a className="m-icon-btn" href={row.receiptUrl} target="_blank" rel="noreferrer" aria-label="Открыть чек"><ExternalLink size={18} /></a>}
          />
        )}
      </div>
      <div className="m-field">
        <label htmlFor="m-payment-date">Дата поступления денег</label>
        <input id="m-payment-date" type="date" value={date} onChange={event => setDate(event.target.value)} />
      </div>
      <button type="button" className="m-btn m-btn--primary m-btn--block" disabled={busy !== null} onClick={confirm}>
        {busy === 'confirm' ? 'Подтверждаю…' : 'Подтвердить платёж'}
      </button>
      <div className="m-btn-row">
        <button type="button" className="m-btn m-btn--danger" disabled={busy !== null} onClick={reject}>
          {busy === 'reject' ? 'Отклоняю…' : 'Отклонить'}
        </button>
        <button type="button" className="m-btn" onClick={onOpenFamily}>Карточка семьи</button>
      </div>
    </Sheet>
  );
}

export default function CashierSection({ user }: { user: AuthenticatedUser }) {
  const nav = useNavPosition();
  const [tab, setTab] = useState<CashierTab>('pending');
  const [query, setQuery] = useState('');
  const [periodKey, setPeriodKey] = useState(currentCashierPeriodKey);

  const pending = useQuery({ queryKey: QK.cashierPaymentsTable, queryFn: fetchCashierPaymentsTable });
  const payments = usePaymentsTable({ enabled: tab === 'confirmed' });
  const refunds = useRefundsTable({ enabled: tab === 'refunds' });

  const allowed = (row: MoneyRow) => isSchoolAllowed(schoolKeyOf(row), user.schoolKeys);
  const pendingRows = useMemo(
    () => (pending.data ?? []).filter(row => allowed(row) && matchesPeriod(row, periodKey)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pending.data, user.schoolKeys, periodKey],
  );
  const visiblePending = useMemo(() => pendingRows.filter(row => moneyRowMatches(row, query)), [pendingRows, query]);
  const confirmedRows = useMemo(
    () => (payments.data ?? [])
      .filter(row => isConfirmedPaymentStatus(row.status) && allowed(row) && matchesPeriod(row, periodKey) && moneyRowMatches(row, query))
      .sort((a, b) => String(b.actualPaymentDate ?? b.createdAt).localeCompare(String(a.actualPaymentDate ?? a.createdAt))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [payments.data, query, user.schoolKeys, periodKey],
  );
  const refundRows = useMemo(
    () => (refunds.data ?? []).filter(row => (
      allowed(row)
      && matchesPeriod({ paymentDate: row.requestedAt, actualPaymentDate: null, createdAt: row.createdAt }, periodKey)
      && moneyRowMatches(row, query)
    )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refunds.data, query, user.schoolKeys, periodKey],
  );

  const openedPayment = nav.sheet?.kind === 'payment'
    ? (pending.data ?? []).find(row => row.id === (nav.sheet as { paymentId: string }).paymentId)
    : undefined;
  const sheet = nav.sheet?.kind === 'family' ? (
    <FamilySheet familyId={nav.sheet.familyId} onClose={nav.back} canEditStatus={false} showFinance />
  ) : openedPayment ? (
    <PendingPaymentSheet
      row={openedPayment}
      userName={user.name}
      onClose={nav.back}
      onOpenFamily={() => nav.push({ kind: 'family', familyId: openedPayment.familyId, sheet: true })}
    />
  ) : null;

  const openFamily = (row: MoneyRow) => nav.push({ kind: 'family', familyId: row.familyId, sheet: true });
  const active = tab === 'pending' ? pending : tab === 'confirmed' ? payments : refunds;

  return (
    <>
      <Screen pageKey={`cashier:${tab}`} title="Кассир" subtitle={user.name}>
        <Segment
          value={tab}
          onChange={value => { setTab(value); setQuery(''); }}
          options={[
            { value: 'pending', label: `Проверка${pendingRows.length ? ` · ${pendingRows.length}` : ''}` },
            { value: 'confirmed', label: 'Оплачено' },
            { value: 'refunds', label: 'Возвраты' },
          ]}
        />
        <Chips value={periodKey} onChange={setPeriodKey} options={PERIOD_OPTIONS} />
        <SearchField value={query} onChange={setQuery} placeholder="Родитель, ребёнок или телефон" />
        {active.error && <ErrorBox>Не удалось загрузить данные. Проверьте интернет и обновите страницу.</ErrorBox>}
        {active.isLoading && !active.data ? <Skeletons /> : tab === 'pending' ? (
          <>
            <div className="m-kpis">
              <Kpi label="Платежей на проверке" value={pendingRows.length} color="#B45309" />
              <Kpi label="На сумму" value={`${compactMoney(pendingRows.reduce((sum, row) => sum + row.amount, 0))} сом`} />
            </div>
            <MoneyList<CashierPaymentRow>
              rows={visiblePending}
              render={row => (
                <MoneyCard
                  row={row}
                  date={row.paymentDate ?? row.createdAt}
                  extra={<Badge>{METHOD_LABEL[row.paymentMethod ?? ''] ?? row.paymentMethod ?? '—'}</Badge>}
                  onClick={() => nav.push({ kind: 'payment', paymentId: row.id, sheet: true })}
                />
              )}
            />
          </>
        ) : tab === 'confirmed' ? (
          <MoneyList<PaymentTableRow>
            rows={confirmedRows}
            render={row => (
              <MoneyCard
                row={row}
                date={row.actualPaymentDate ?? row.paymentDate}
                extra={<Badge tone={{ bg: '#DCFCE7', color: '#166534' }}>{METHOD_LABEL[row.paymentMethod ?? ''] ?? 'Подтверждено'}</Badge>}
                onClick={() => openFamily(row)}
              />
            )}
          />
        ) : (
          <>
            <MoneyList<RefundTableRow>
              rows={refundRows}
              render={row => {
                const status = REFUND_STATUS[row.status] ?? REFUND_STATUS.pending;
                return (
                  <MoneyCard
                    row={row}
                    date={row.requestedAt}
                    extra={<><Badge tone={status}>{status.label}</Badge>{row.comment && <Badge>{row.comment}</Badge>}</>}
                    onClick={() => openFamily(row)}
                  />
                );
              }}
            />
            <div className="m-note">Подтверждение возвратов — в полной версии на компьютере.</div>
          </>
        )}
      </Screen>
      {sheet}
    </>
  );
}
