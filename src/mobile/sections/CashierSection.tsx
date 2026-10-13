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
import { SchoolCard } from '../cards';
import { schoolByKey, schoolsFor } from '../data';
import { Screen, useNavPosition } from '../nav';
import { Badge, Empty, ErrorBox, formatDate, InfoRow, Kpi, PhoneRow, SearchField, Segment, SelectField, Sheet, Skeletons, todayIso, useIncremental } from '../ui';

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

function isQr(method: string | null): boolean {
  const value = String(method ?? '').toLowerCase();
  return value === 'transfer' || value === 'card' || value.includes('qr') || value.includes('безнал');
}

const sum = (rows: { amount: number }[]) => rows.reduce((total, row) => total + row.amount, 0);
const som = (value: number) => `${compactMoney(value)} сом`;

export default function CashierSection({ user }: { user: AuthenticatedUser }) {
  const nav = useNavPosition();
  const [tab, setTab] = useState<CashierTab>('pending');
  const [query, setQuery] = useState('');
  const [schoolQuery, setSchoolQuery] = useState('');
  const [periodKey, setPeriodKey] = useState(currentCashierPeriodKey);

  const pending = useQuery({ queryKey: QK.cashierPaymentsTable, queryFn: fetchCashierPaymentsTable });
  const payments = usePaymentsTable({ enabled: tab === 'confirmed' });
  const refunds = useRefundsTable({ enabled: tab === 'refunds' });

  // Строки месяца по доступным школам — основа и для сводки, и для списков.
  const pendingBase = useMemo(
    () => (pending.data ?? [])
      .filter(row => isSchoolAllowed(schoolKeyOf(row), user.schoolKeys) && matchesPeriod(row, periodKey))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [pending.data, user.schoolKeys, periodKey],
  );
  const confirmedBase = useMemo(
    () => (payments.data ?? [])
      .filter(row => isConfirmedPaymentStatus(row.status) && isSchoolAllowed(schoolKeyOf(row), user.schoolKeys) && matchesPeriod(row, periodKey))
      .sort((a, b) => String(b.actualPaymentDate ?? b.createdAt).localeCompare(String(a.actualPaymentDate ?? a.createdAt))),
    [payments.data, user.schoolKeys, periodKey],
  );
  const refundBase = useMemo(
    () => (refunds.data ?? []).filter(row => (
      isSchoolAllowed(schoolKeyOf(row), user.schoolKeys)
      && matchesPeriod({ paymentDate: row.requestedAt, actualPaymentDate: null, createdAt: row.createdAt }, periodKey)
    )),
    [refunds.data, user.schoolKeys, periodKey],
  );

  const page = nav.page;
  const schoolKey = page?.kind === 'school' ? page.schoolKey : null;
  const activeQuery = schoolKey ? schoolQuery : query;
  const inScope = (row: MoneyRow) => (!schoolKey || schoolKeyOf(row) === schoolKey) && moneyRowMatches(row, activeQuery);
  const visiblePending = useMemo(() => pendingBase.filter(inScope),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingBase, schoolKey, activeQuery]);
  const visibleConfirmed = useMemo(() => confirmedBase.filter(inScope),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confirmedBase, schoolKey, activeQuery]);
  const visibleRefunds = useMemo(() => refundBase.filter(inScope),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refundBase, schoolKey, activeQuery]);

  const openedPayment = nav.sheet?.kind === 'payment'
    ? (pending.data ?? []).find(row => row.id === (nav.sheet as { paymentId: string }).paymentId)
    : undefined;
  const sheet = nav.sheet?.kind === 'family' ? (
    <FamilySheet familyId={nav.sheet.familyId} userName={user.name} onClose={nav.back} canEditStatus={false} showFinance />
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

  const list = tab === 'pending' ? (
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
  ) : tab === 'confirmed' ? (
    <MoneyList<PaymentTableRow>
      rows={visibleConfirmed}
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
        rows={visibleRefunds}
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
  );

  /** Показатели для текущей вкладки — общие и по школе. */
  const statsFor = (key: string | null) => {
    const own = <T extends MoneyRow>(rows: T[]) => (key ? rows.filter(row => schoolKeyOf(row) === key) : rows);
    if (tab === 'pending') {
      const rows = own(pendingBase);
      return [
        { label: 'на проверке', value: rows.length, color: '#B45309' },
        { label: 'на сумму', value: som(sum(rows)), color: '#2563EB' },
      ];
    }
    if (tab === 'confirmed') {
      const rows = own(confirmedBase);
      return [
        { label: 'оплачено', value: som(sum(rows)), color: '#16A34A' },
        { label: 'QR / банк', value: som(sum(rows.filter(row => isQr(row.paymentMethod)))), color: '#1D6FA4' },
        { label: 'наличные', value: som(sum(rows.filter(row => !isQr(row.paymentMethod)))), color: '#15803D' },
      ];
    }
    const rows = own(refundBase);
    return [
      { label: 'на проверке', value: som(sum(rows.filter(row => row.status === 'pending'))), color: '#7C3AED' },
      { label: 'подтверждено', value: som(sum(rows.filter(row => row.status === 'confirmed'))), color: '#16A34A' },
    ];
  };

  const controls = (
    <>
      <Segment
        value={tab}
        onChange={value => setTab(value)}
        options={[
          { value: 'pending', label: `Проверка${pendingBase.length ? ` · ${pendingBase.length}` : ''}` },
          { value: 'confirmed', label: 'Оплачено' },
          { value: 'refunds', label: 'Возвраты' },
        ]}
      />
      <SelectField label="Месяц" value={periodKey} onChange={setPeriodKey} options={PERIOD_OPTIONS} />
    </>
  );

  if (page?.kind === 'school') {
    const school = schoolByKey(page.schoolKey);
    return (
      <>
        <Screen pageKey={`cashier:${page.schoolKey}:${tab}`} title={school?.label ?? page.schoolKey} subtitle="Кассир" onBack={nav.back}>
          {controls}
          <div className="m-kpis">
            {statsFor(page.schoolKey).slice(0, 2).map(stat => <Kpi key={stat.label} label={stat.label} value={stat.value} color={stat.color} />)}
          </div>
          <SearchField value={schoolQuery} onChange={setSchoolQuery} placeholder="Родитель, ребёнок или телефон" />
          {active.error && <ErrorBox>Не удалось загрузить данные. Проверьте интернет и обновите страницу.</ErrorBox>}
          {active.isLoading && !active.data ? <Skeletons /> : list}
        </Screen>
        {sheet}
      </>
    );
  }

  const base: MoneyRow[] = tab === 'pending' ? pendingBase : tab === 'confirmed' ? confirmedBase : refundBase;
  const schools = schoolsFor(user.schoolKeys).filter(school => base.some(row => schoolKeyOf(row) === school.key));

  return (
    <>
      <Screen pageKey={`cashier:home:${tab}`} title="Кассир" subtitle={user.name}>
        {controls}
        <SearchField value={query} onChange={setQuery} placeholder="Поиск по всем школам: родитель или телефон" />
        {active.error && <ErrorBox>Не удалось загрузить данные. Проверьте интернет и обновите страницу.</ErrorBox>}
        {active.isLoading && !active.data ? <Skeletons /> : query.trim() ? list : (
          <>
            <div className={`m-kpis ${tab === 'confirmed' ? 'm-kpis--3' : ''}`}>
              {statsFor(null).map(stat => <Kpi key={stat.label} label={stat.label} value={stat.value} color={stat.color} />)}
            </div>
            <div className="m-section-title">Школы</div>
            <div className="m-list">
              {schools.map(school => (
                <SchoolCard
                  key={school.key}
                  school={school}
                  stats={statsFor(school.key)}
                  onClick={() => { setSchoolQuery(''); nav.push({ kind: 'school', schoolKey: school.key }); }}
                />
              ))}
              {!schools.length && <Empty>За этот месяц ничего нет</Empty>}
            </div>
          </>
        )}
      </Screen>
      {sheet}
    </>
  );
}
