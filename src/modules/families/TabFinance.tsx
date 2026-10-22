import FilterableTable from '../../core/tables/FilterableTable';
import React, { useEffect, useMemo, useState } from 'react';
import { Loader, Paperclip, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useReceiptOcr } from '../../hooks/useReceiptOcr';
import { Charge, Child, Family, FamilyPayment, PaymentItem, PaymentType, Refund, UserRole } from '../../types';
import { money } from '../../utils/pricing';
import { ALL_PERIODS, PERIOD_LABEL } from './constants';
import './ReceiptPreview.css';
import ReceiptModal, { isPdfReceipt } from './ReceiptModal';
import { Section, Spinner, Empty } from './DrawerUI';

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  cash: 'Наличные',
  transfer: 'АйКай Мбанк',
  card: 'АйКай Мбанк',
  other: 'Другое',
};

interface Props {
  mode?: 'all' | 'payments' | 'charges' | 'refunds';
  charges: Charge[];
  payments: FamilyPayment[];
  paymentItems: PaymentItem[];
  refunds: Refund[];
  loading: boolean;
  family: Family;
  children: Child[];
  isAdmin: boolean;
  isCashier: boolean;
  isManager: boolean;
  userRole?: UserRole;
  onSaveCharge: (charge: Charge, updates: Partial<Charge>) => Promise<boolean>;
  onDeleteCharge: (charge: Charge) => void;
  onAddCharges: (month: number, year: number) => void | Promise<void>;
  onCreatePayment: (amount: number, paymentType: PaymentType, comment: string, paymentDate: string, receiptFile?: File | null, receiptCode?: string, paymentOrderNumber?: string, receiptDetails?: {time:string;cardLast4:string;bank:string}) => Promise<boolean>;
  onConfirmPayment: (payment: FamilyPayment, actualPaymentDate: string) => Promise<boolean>;
  onUnconfirmPayment?: (payment: FamilyPayment) => Promise<boolean>;
  onSavePayment: (payment: FamilyPayment, updates: Partial<FamilyPayment>) => Promise<boolean>;
  onDeletePayment: (payment: FamilyPayment) => Promise<boolean>;
  onCreateRefund: (amount: number, comment: string) => Promise<boolean>;
  onConfirmRefund: (refund: Refund, paymentMethod: 'cash' | 'cashless', paymentOrderNumber?: string, receiptDetails?: {time:string;cardLast4:string;bank:string}) => Promise<boolean>;
  onRejectRefund: (refund: Refund, reason: string) => Promise<boolean>;
  readOnly?: boolean;
  onReceiptDetailsSaved?: () => void;
}

export function canCreateFamilyRefund(isManager: boolean, isAdmin: boolean, isCashier: boolean): boolean {
  return isManager || isAdmin || isCashier;
}

export default function TabFinance({
  mode = 'all',
  charges,
  payments,
  paymentItems,
  refunds,
  family,
  loading,
  children: _children,
  isAdmin,
  isCashier,
  isManager,
  userRole: _userRole,
  onSaveCharge: _onSaveCharge,
  onDeleteCharge: _onDeleteCharge,
  onAddCharges,
  onCreatePayment,
  onConfirmPayment,
  onUnconfirmPayment,
  onSavePayment,
  onDeletePayment,
  onCreateRefund,
  onConfirmRefund,
  onRejectRefund,
  readOnly = false,
  onReceiptDetailsSaved,
}: Props) {
  const [addingPeriod, setAddingPeriod] = useState(false);
  const [creatingPeriod, setCreatingPeriod] = useState(false);
  const [newPeriodKey, setNewPeriodKey] = useState('9');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('cash');
  const [paymentOrderNumber, setPaymentOrderNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const { ocrLoading, ocrMsg, receiptFile, receiptCode, setReceiptCode, receiptTime,setReceiptTime,receiptCardLast4,setReceiptCardLast4,receiptBank,setReceiptBank, handleFileChange: handleOcrFile, reset: resetOcr } = useReceiptOcr();
  const [preview,setPreview]=useState<{url:string;name:string;pdf:boolean;paymentId?:string}|null>(null);
  const [localReceiptUrl,setLocalReceiptUrl]=useState('');
  useEffect(()=>{
    if(!receiptFile){setLocalReceiptUrl('');return;}
    const url=URL.createObjectURL(receiptFile);setLocalReceiptUrl(url);
    return ()=>{URL.revokeObjectURL(url);setPreview(current=>current?.url===url?null:current);};
  },[receiptFile]);
  const [comment, setComment] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentError,setPaymentError]=useState('');
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const [refundAmount, setRefundAmount] = useState('');
  const [refundComment, setRefundComment] = useState('');
  const [savingRefund, setSavingRefund] = useState(false);
  const [confirmingRefundId, setConfirmingRefundId] = useState<string | null>(null);

  const totalDebt = charges.reduce((s, c) => s + c.debtAmount, 0);
  const canCreatePayment = !isCashier || isAdmin || (isCashier && !readOnly);
  const canConfirmPayment = !readOnly && (isCashier || isAdmin);
  // A cashier may create a refund without enabling the general family editor.
  // `readOnly` protects non-financial family fields and must not hide this form.
  const canCreateRefund = canCreateFamilyRefund(isManager, isAdmin, isCashier);
  const canConfirmRefund = !readOnly && (isCashier || isAdmin);

  const existingPeriodKeys = new Set(charges.map(c => periodGroupKey(c.periodMonth, c.year, c.chargeType)));
  const availablePeriods = ALL_PERIODS.filter(p => !existingPeriodKeys.has(periodGroupKey(p.month, p.year, p.key)));
  const periodRows = useMemo(() => buildPeriodRows(charges, payments, paymentItems), [charges, payments, paymentItems]);
  const sortedPayments = useMemo(() => [...payments].sort((a, b) => (
    new Date(b.createdAt || b.paymentDate || 0).getTime() - new Date(a.createdAt || a.paymentDate || 0).getTime()
  )), [payments]);

  if (loading) return <Spinner />;

  async function submitPayment() {
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0 || savingPayment || ocrLoading) return;
    setSavingPayment(true);setPaymentError('');
    let ok=false;
    try { ok = await onCreatePayment(amount, paymentType, comment, paymentDate, receiptFile, receiptCode || undefined, paymentOrderNumber.trim() || undefined, {time:receiptTime,cardLast4:receiptCardLast4,bank:receiptBank}); }
    catch(error){setPaymentError(error instanceof Error?error.message:'Не удалось отправить платёж');}
    finally{setSavingPayment(false);}
    if (ok) {
      setMsg('Платёж отправлен кассиру на проверку');
      setPaymentAmount('');
      resetOcr();
      setComment('');
      setPaymentOrderNumber('');
      setTimeout(() => setMsg(''), 2500);
    } else {
      setMsg('Не удалось внести платёж');
    }
  }

  async function addSelectedPeriod() {
    const period = availablePeriods.find(p => p.key === newPeriodKey) ?? availablePeriods[0];
    if (!period || creatingPeriod) return;
    setCreatingPeriod(true);
    try {
      await onAddCharges(period.month, period.year);
      setAddingPeriod(false);
    } catch {
      setMsg('Не удалось создать начисления');
    } finally {
      setCreatingPeriod(false);
    }
  }

  async function confirmPayment(payment: FamilyPayment, actualPaymentDate: string) {
    setConfirmingPaymentId(payment.id);
    const ok = await onConfirmPayment(payment, actualPaymentDate);
    setConfirmingPaymentId(null);
    setMsg(ok ? 'Платёж подтверждён и распределён' : 'Не удалось подтвердить платёж');
    setTimeout(() => setMsg(''), 2500);
  }

  async function submitRefund() {
    const amount = Number(refundAmount);
    if (!amount || amount <= 0) return;
    setSavingRefund(true);
    const ok = await onCreateRefund(amount, refundComment);
    setSavingRefund(false);
    if (ok) {
      setMsg('Возврат отправлен кассиру на проверку');
      setRefundAmount('');
      setRefundComment('');
      setTimeout(() => setMsg(''), 2500);
    } else {
      setMsg('Не удалось оформить возврат');
    }
  }

  async function confirmRefund(refund: Refund, paymentMethod: 'cash' | 'cashless', paymentOrderNumber?: string) {
    setConfirmingRefundId(refund.id);
    const ok = await onConfirmRefund(refund, paymentMethod, paymentOrderNumber);
    setConfirmingRefundId(null);
    setMsg(ok ? 'Возврат подтверждён и списан с баланса' : 'Не удалось подтвердить возврат');
    setTimeout(() => setMsg(''), 2500);
  }

  async function rejectRefund(refund: Refund) {
    const reason = window.prompt('Причина отказа:', '')?.trim();
    if (reason === undefined) return;
    setConfirmingRefundId(refund.id);
    const ok = await onRejectRefund(refund, reason);
    setConfirmingRefundId(null);
    setMsg(ok ? 'Возврат отклонён' : 'Не удалось отклонить возврат');
    setTimeout(() => setMsg(''), 2500);
  }

  return (
    <div><div>
      {msg && (
        <div style={{ background: msg.includes('Не удалось') ? '#FEE2E2' : '#F7F9FB', color: msg.includes('Не удалось') ? '#991B1B' : 'var(--text)', borderRadius: 8, padding: '7px 12px', marginBottom: 8, fontSize: 12, fontWeight: 600 }}>
          {msg}
        </div>
      )}

      <div style={financeLayoutStyle}>
        {(mode === 'all' || mode === 'payments' || mode === 'refunds') && <div className="family-money-grid">
          <div className="family-money-form family-money-payment-form">
          {canCreatePayment && (
            <Section title="Новый платёж">
              <div style={paymentPanelStyle}>
                <div style={newPaymentGridStyle}>
                  <input aria-label="Сумма платежа" min="0.01" step="0.01" type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder={totalDebt > 0 ? `Долг: ${money(totalDebt)}` : 'Сумма'} style={inputStyle} />
                  <select aria-label="Способ оплаты" value={paymentType} onChange={e => setPaymentType(e.target.value as PaymentType)} style={inputStyle}>
                    <option value="cash">Наличные</option>
                    <option value="transfer">АйКай Мбанк</option>
                  </select>
                  <input aria-label="Дата платежа" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} style={inputStyle} />
                  <input aria-label="Время операции чека" value={receiptTime} onChange={e=>setReceiptTime(e.target.value)} placeholder="ЧЧ:ММ или ЧЧ:ММ:СС" style={{...inputStyle,width:'100%',minWidth:0}}/>
                  <input aria-label="Банк чека" value={receiptBank} onChange={e=>setReceiptBank(e.target.value)} placeholder="Банк отправителя" style={{...inputStyle,width:'100%',minWidth:0}}/>
                  <input aria-label="Последние 4 цифры счёта" inputMode="numeric" maxLength={4} value={receiptCardLast4} onChange={e=>setReceiptCardLast4(e.target.value.replace(/\D/g,''))} placeholder="Последние 4 цифры" style={{...inputStyle,width:'100%',minWidth:0}}/>
                  <input value={receiptCode} onChange={e => setReceiptCode(e.target.value)} placeholder="Код чека" style={inputStyle} />
                  <input value={paymentOrderNumber} onChange={e => setPaymentOrderNumber(e.target.value)} placeholder="№ платёжного поручения" style={inputStyle} />
                  <label style={{ ...fileInputStyle, gridColumn:'1 / -1', width: '100%', boxSizing: 'border-box' }}>
                    {ocrLoading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Paperclip size={14} />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{receiptFile ? 'Заменить чек' : 'Прикрепить чек'}</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={e => handleOcrFile(e.target.files?.[0] ?? null, (amount, date) => {
                        if (amount) setPaymentAmount(String(amount));
                        if (date) setPaymentDate(date);
                      })}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {receiptFile && <button type="button" className="receipt-preview-link" style={{gridColumn:'1 / -1'}} disabled={!localReceiptUrl} onClick={()=>setPreview({url:localReceiptUrl,name:receiptFile.name,pdf:receiptFile.type==='application/pdf' || receiptFile.name.toLowerCase().endsWith('.pdf')})}><Paperclip size={14}/>{receiptFile.name} · Открыть</button>}
                  <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Комментарий" style={{...inputStyle,gridColumn:'1 / -1'}} />
                  {ocrMsg && <div style={{ gridColumn: '1 / -1', fontSize: 11, color: ocrMsg.startsWith('✓') ? '#065F46' : '#92400E', padding: '0 2px' }}>{ocrMsg}</div>}
                  {paymentError && <div role="alert" style={{gridColumn:'1 / -1',color:'#991B1B',padding:10,background:'#FEF2F2',borderRadius:8,fontSize:12}}>{paymentError}</div>}
                  <button onClick={submitPayment} disabled={savingPayment || ocrLoading || !paymentAmount} style={submitPaymentBtnStyle(savingPayment || ocrLoading || !paymentAmount)}>
                    {savingPayment ? 'Сохраняем...' : 'На проверку →'}
                  </button>
                </div>
              </div>
            </Section>
          )}
          </div>
          <div className="family-money-form family-money-refund-form">
            <Section title="Новый возврат">
              <div style={paymentPanelStyle}>
              {canCreateRefund && (
                <div className="finance-refund-form" style={{ ...newPaymentGridStyle, marginBottom: refunds.length > 0 ? 10 : 0 }}>
                  <input type="number" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} placeholder="Сумма возврата" style={inputStyle} />
                  <input value={refundComment} onChange={e => setRefundComment(e.target.value)} placeholder="Комментарий" className="finance-refund-comment" style={inputStyle} />
                  <button onClick={submitRefund} disabled={savingRefund || !refundAmount} style={submitPaymentBtnStyle(savingRefund || !refundAmount)}>
                    {savingRefund ? 'Сохраняем...' : 'Оформить возврат →'}
                  </button>
                </div>
              )}
              </div>
            </Section>
          </div>
          <div className="family-money-payment-list">
          <Section title={`Платежи (${payments.length})`}>
            <div style={paymentsListStyle}>
              {sortedPayments.length === 0 ? <Empty text="Платежей нет" /> : sortedPayments.map(payment => (
                <PaymentRow
                  key={payment.id}
                  onOpenReceipt={()=>setPreview({url:payment.receiptUrl!,name:'Чек платежа',pdf:isPdfReceipt(payment.receiptUrl!),paymentId:payment.id})}
                  payment={payment}
                  items={paymentItems.filter(i => i.paymentId === payment.id)}
                  canConfirm={canConfirmPayment && payment.status === 'На проверке'}
                  confirming={confirmingPaymentId === payment.id}
                  onConfirm={(actualPaymentDate) => confirmPayment(payment, actualPaymentDate)}
                  onSave={updates => onSavePayment(payment, updates)}
                  onDelete={() => onDeletePayment(payment)}
                  onUnconfirm={onUnconfirmPayment && payment.status === 'Подтверждено' ? () => onUnconfirmPayment(payment) : undefined}
                  canDelete={!readOnly && (isAdmin || isCashier)}
                  isAdmin={!readOnly && isAdmin}
                />
              ))}
            </div>
          </Section>
          </div>
          <div className="family-money-refund-list">
            <Section title={`Возвраты (${refunds.length})`}>

              {refunds.length === 0 ? (
                <Empty text="Возвратов нет" />
              ) : refunds.map(refund => (
                <RefundRow
                  key={refund.id}
                  refund={refund}
                  canConfirm={canConfirmRefund && refund.status === 'На проверке'}
                  confirming={confirmingRefundId === refund.id}
                  onConfirm={paymentMethod => confirmRefund(refund, paymentMethod)}
                  onReject={() => rejectRefund(refund)}
                />
              ))}
            </Section>
          </div>
        </div>}

        {(mode === 'all' || mode === 'charges') && <Section
          title="Начисления по периодам"
          action={!readOnly && isAdmin && (
            <button onClick={() => setAddingPeriod(p => !p)} style={smallAccentBtn}>
              <Plus size={11} /> Период
            </button>
          )}
        >
          {addingPeriod && (
            <div style={{ background: '#F7F9FB', borderRadius: 10, padding: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>Создать начисления всем детям</div>
              <div style={{ display: 'flex', gap: 7 }}>
                <select aria-label="Период начисления" value={availablePeriods.some(p => p.key === newPeriodKey) ? newPeriodKey : availablePeriods[0]?.key ?? ''} onChange={e => setNewPeriodKey(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                  {availablePeriods.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
                <button onClick={addSelectedPeriod} disabled={creatingPeriod || availablePeriods.length === 0} style={smallAccentBtn}>{creatingPeriod ? 'Создание…' : 'Создать'}</button>
              </div>
            </div>
          )}

          <div style={financeTableWrapStyle}>
            <FilterableTable data-comment-table="families/TabFinance:0" data-comment-context={family.id} style={financeTableStyle}>
              <thead>
                <tr>
                  {['Период', 'Начислено', 'Погашено', 'Остаток', 'Дата списания'].map(label => (
                    <th key={label} style={financeThStyle}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periodRows.length === 0 ? (
                  <tr><td colSpan={5} style={financeEmptyCellStyle}>Начислений нет</td></tr>
                ) : periodRows.map(row => (
                  <tr data-comment-row={row.key} key={row.key}>
                    <td style={financeTdStyle}>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{row.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{row.childrenCount} начисл.</div>
                    </td>
                    <td style={{ ...financeTdStyle, textAlign: 'left', fontWeight: 600 }}>{money(row.charged)}</td>
                    <td style={{ ...financeTdStyle, textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, color: '#146566' }}>
                        {money(row.paid)}
                      </div>
                    </td>
                    <td style={{ ...financeTdStyle, textAlign: 'left', color: row.debt > 0 ? '#B42318' : 'var(--text-2)', fontWeight: 600 }}>{money(row.debt)}</td>
                    <td style={financeTdStyle}>{row.writeOffDate || '-'}</td>
                  </tr>
                ))}
              </tbody>
              {periodRows.length > 0 && (
                <tfoot>
                  <tr>
                    <td style={financeTotalCellStyle}>Итого</td>
                    <td style={{ ...financeTotalCellStyle, textAlign: 'left' }}>{money(periodRows.reduce((sum, row) => sum + row.charged, 0))}</td>
                    <td style={{ ...financeTotalCellStyle, textAlign: 'left' }}>{money(periodRows.reduce((sum, row) => sum + row.paid, 0))}</td>
                    <td style={{ ...financeTotalCellStyle, textAlign: 'left' }}>{money(periodRows.reduce((sum, row) => sum + row.debt, 0))}</td>
                    <td style={financeTotalCellStyle} />
                  </tr>
                </tfoot>
              )}
            </FilterableTable>
          </div>
        </Section>}

      </div>
    </div>
      {preview && <ReceiptModal receiptUrl={preview.url} title={preview.name} subtitle={family.parentName} pdf={preview.pdf} paymentId={preview.paymentId} canEdit={isAdmin || isCashier} onClose={()=>setPreview(null)} onSaved={onReceiptDetailsSaved ? () => onReceiptDetailsSaved() : undefined}/>}
    </div>
  );
}

function PaymentRow({ onOpenReceipt, payment, items, canConfirm, confirming, onConfirm, onUnconfirm, onSave, onDelete, isAdmin, canDelete }: {
  onOpenReceipt:()=>void;
  payment: FamilyPayment;
  items: PaymentItem[];
  canConfirm: boolean;
  confirming: boolean;
  onConfirm: (actualPaymentDate: string) => void;
  onUnconfirm?: () => void;
  onSave: (updates: Partial<FamilyPayment>) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  canDelete: boolean;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(payment.amount));
  const [paymentType, setPaymentType] = useState<PaymentType>(payment.paymentType);
  const [paymentOrderNumber, setPaymentOrderNumber] = useState(payment.paymentOrderNumber ?? '');
  const [paymentDate, setPaymentDate] = useState(payment.paymentDate ? payment.paymentDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [actualPaymentDate, setActualPaymentDate] = useState(
    payment.actualPaymentDate
      ? payment.actualPaymentDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );
  const [status, setStatus] = useState(payment.status);
  const [comment, setComment] = useState(payment.comment ?? '');
  const [saving, setSaving] = useState(false);
  const statusStyle = payment.status === 'Подтверждено'
    ? { background: '#ECFDF5', color: '#065F46' }
    : payment.status === 'Отклонено'
      ? { background: '#FEE2E2', color: '#991B1B' }
      : { background: '#FEF9C3', color: '#92400E' };

  async function save() {
    setSaving(true);
    const ok = await onSave({ amount: Number(amount), paymentType, paymentOrderNumber: paymentOrderNumber.trim() || undefined, paymentDate, actualPaymentDate, status, comment });
    setSaving(false);
    if (ok) setEditing(false);
  }

  async function remove() {
    const msg = payment.status === 'Подтверждено'
      ? 'Удалить платёж и чек из рабочего списка? Баланс и начисления будут пересчитаны. Данные останутся в истории семьи.'
      : 'Удалить платёж и чек из рабочего списка? Данные останутся в истории семьи.';
    if (saving || confirming || !window.confirm(msg)) return;
    setSaving(true);
    try { await onDelete(); } finally { setSaving(false); }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', marginBottom: 7 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{money(payment.amount)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>
            {payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString('ru-RU') : 'без даты'} · {PAYMENT_TYPE_LABEL[payment.paymentType] ?? payment.paymentType}
            {payment.paymentOrderNumber && <> · п/п {payment.paymentOrderNumber}</>}
            {payment.actualPaymentDate && <> · факт {new Date(payment.actualPaymentDate).toLocaleDateString('ru-RU')}</>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <div style={{ ...statusStyle, borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {payment.status}
          </div>
          {onUnconfirm && !editing && (
            <button
              onClick={() => { if (window.confirm('Отменить подтверждение? Баланс будет откатан.')) onUnconfirm(); }}
              title="Отменить подтверждение"
              style={{ ...iconBtnStyle, color: '#DC2626' }}
            >
              <X size={13} />
            </button>
          )}
          {canDelete && !editing && <button type="button" onClick={remove} title="Удалить платёж и чек" aria-label="Удалить платёж и чек" disabled={saving || confirming} style={{ ...iconBtnStyle, color: '#DC2626' }}><Trash2 size={13} /></button>}
          {isAdmin && !editing && (
            <button onClick={() => setEditing(true)} title="Редактировать" style={iconBtnStyle}>
              <Pencil size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Кассир: подтверждение / отклонение */}
      {canConfirm && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            type="date"
            value={actualPaymentDate}
            onChange={e => setActualPaymentDate(e.target.value)}
            placeholder="Дата поступления"
            style={{ ...inputStyle, width: '100%' }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button
              onClick={() => onConfirm(actualPaymentDate)}
              disabled={confirming || !actualPaymentDate}
              style={{
                height: 30, border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 600,
                cursor: confirming || !actualPaymentDate ? 'default' : 'pointer',
                background: confirming || !actualPaymentDate ? '#D1FAE5' : '#10B981',
                color: '#fff',
              }}
            >
              {confirming ? '...' : '✓ Подтвердить'}
            </button>
            <button
              onClick={() => onSave({ status: 'Отклонено' })}
              disabled={confirming}
              style={{
                height: 30, border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 600,
                cursor: confirming ? 'default' : 'pointer',
                background: '#FEE2E2', color: '#991B1B',
              }}
            >
              ✕ Отклонить
            </button>
          </div>
        </div>
      )}

      {/* Админ: редактирование */}
      {isAdmin && editing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Сумма" style={inputStyle} />
            <select value={paymentType} onChange={e => setPaymentType(e.target.value as PaymentType)} style={inputStyle}>
              <option value="cash">Наличные</option>
              <option value="transfer">АйКай Мбанк</option>
            </select>
            <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} style={inputStyle} />
            <input type="date" value={actualPaymentDate} onChange={e => setActualPaymentDate(e.target.value)} style={inputStyle} />
            <input value={paymentOrderNumber} onChange={e => setPaymentOrderNumber(e.target.value)} placeholder="№ платёжного поручения" style={{ ...inputStyle, gridColumn: '1 / -1' }} />
          </div>
          <select value={status} onChange={e => setStatus(e.target.value as any)} style={{ ...inputStyle, width: '100%' }}>
            <option value="На проверке">На проверке</option>
            <option value="Отклонено">Отклонено</option>
            <option value="Черновик">Черновик</option>
            {payment.status === 'Подтверждено' && <option value="Подтверждено">Подтверждено</option>}
          </select>
          <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Комментарий" style={{ ...inputStyle, width: '100%' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={save} disabled={saving} style={smallAccentBtn}>{saving ? '...' : <><Save size={12} /> Сохранить</>}</button>
            <button onClick={() => setEditing(false)} style={{ ...smallAccentBtn, background: '#F3F4F6', color: 'var(--text)' }}><X size={12} /></button>
            <button type="button" onClick={remove} disabled={saving} aria-label="Удалить" title="Удалить" style={{ ...smallAccentBtn, background: '#FEE2E2', color: '#991B1B' }}><Trash2 size={12} /></button>
          </div>
        </div>
      )}
      {payment.comment && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 6 }}>{payment.comment}</div>}
      {payment.receiptUrl && (
        <button type="button" onClick={onOpenReceipt} style={{...receiptLinkStyle,border:0,background:'transparent',cursor:'pointer'}}>
          <Paperclip size={12} /> Чек
        </button>
      )}
      {items.length > 0 && (
        <div style={{ marginTop: 7, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
          {items.map(item => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-2)', padding: '2px 0' }}>
              <span>{PERIOD_LABEL[String(item.periodMonth)] ?? item.periodMonth}/{item.year}</span>
              <span>{money(item.paidAmount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RefundRow({ refund, canConfirm, confirming, onConfirm, onReject }: {
  refund: Refund;
  canConfirm: boolean;
  confirming: boolean;
  onConfirm: (paymentMethod: 'cash' | 'cashless', paymentOrderNumber?: string) => void;
  onReject: () => void;
}) {
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'cashless'>('cashless');
  const [paymentOrderNumber, setPaymentOrderNumber] = useState('');
  const statusStyle = refund.status === 'Подтверждено'
    ? { background: '#ECFDF5', color: '#065F46' }
    : refund.status === 'Отклонено'
      ? { background: '#FEE2E2', color: '#991B1B' }
      : { background: '#FEF9C3', color: '#92400E' };

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', marginBottom: 7 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{money(refund.amount)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>
            {refund.requestedAt ? new Date(refund.requestedAt).toLocaleDateString('ru-RU') : 'без даты'}
            {refund.requestedBy && <> · {refund.requestedBy}</>}
          </div>
        </div>
        <div style={{ ...statusStyle, borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {refund.status}
        </div>
      </div>

      {canConfirm && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as 'cash' | 'cashless')} style={{ ...inputStyle, width: '100%' }}>
            <option value="cashless">АйКай Мбанк</option>
            <option value="cash">Наличные</option>
          </select>
          <input value={paymentOrderNumber} onChange={e => setPaymentOrderNumber(e.target.value)} placeholder="№ платёжного поручения" style={{ ...inputStyle, width: '100%' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button
              onClick={() => onConfirm(paymentMethod, paymentOrderNumber.trim() || undefined)}
              disabled={confirming}
              style={{
                height: 30, border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 600,
                cursor: confirming ? 'default' : 'pointer',
                background: confirming ? '#D1FAE5' : '#10B981',
                color: '#fff',
              }}
            >
              {confirming ? '...' : '✓ Подтвердить'}
            </button>
            <button
              onClick={onReject}
              disabled={confirming}
              style={{
                height: 30, border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 600,
                cursor: confirming ? 'default' : 'pointer',
                background: '#FEE2E2', color: '#991B1B',
              }}
            >
              ✕ Отклонить
            </button>
          </div>
        </div>
      )}

      {refund.comment && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 6 }}>{refund.comment}</div>}
      {refund.status === 'Отклонено' && refund.rejectReason && (
        <div style={{ fontSize: 11, color: '#991B1B', marginTop: 4 }}>Причина: {refund.rejectReason}</div>
      )}
    </div>
  );
}

interface PeriodFinanceRow {
  key: string;
  label: string;
  charged: number;
  paid: number;
  debt: number;
  childrenCount: number;
  writeOffDate: string;
}

function periodGroupKey(month: number, year: number, chargeType?: string): string {
  if (chargeType === 'deposit' || month === 0) return 'deposit';
  return `${month}:${year}`;
}

function periodLabel(month: number, year: number, chargeType?: string): string {
  if (chargeType === 'deposit' || month === 0) return 'Депозит';
  return `${PERIOD_LABEL[String(month)] ?? month} ${year}`;
}

function formatShortDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU');
}

export function periodPaidDisplayAmount(row: Pick<PeriodFinanceRow, 'paid' | 'debt'>): number {
  return row.debt > 0 ? -row.debt : row.paid;
}

export function buildPeriodRows(charges: Charge[], payments: FamilyPayment[], paymentItems: PaymentItem[]): PeriodFinanceRow[] {
  const paymentsById = new Map(payments.map(payment => [payment.id, payment]));
  const grouped = new Map<string, PeriodFinanceRow & { rawMonth: number; rawYear: number; dateValue: number }>();

  ALL_PERIODS.forEach(period => {
    const key = periodGroupKey(period.month, period.year, period.key);
    grouped.set(key, {
      key,
      label: period.label,
      charged: 0,
      paid: 0,
      debt: 0,
      childrenCount: 0,
      writeOffDate: '',
      rawMonth: period.key === 'deposit' ? 0 : period.month,
      rawYear: period.year,
      dateValue: 0,
    });
  });

  charges.forEach(charge => {
    const key = periodGroupKey(charge.periodMonth, charge.year, charge.chargeType);
    const existing = grouped.get(key);
    if (existing) {
      existing.charged += Number(charge.amount || 0);
      existing.paid += Number(charge.paidAmount || 0);
      existing.debt += Number(charge.debtAmount || 0);
      existing.childrenCount += 1;
      return;
    }
    grouped.set(key, {
      key,
      label: periodLabel(charge.periodMonth, charge.year, charge.chargeType),
      charged: Number(charge.amount || 0),
      paid: Number(charge.paidAmount || 0),
      debt: Number(charge.debtAmount || 0),
      childrenCount: 1,
      writeOffDate: '',
      rawMonth: charge.chargeType === 'deposit' ? 0 : charge.periodMonth,
      rawYear: charge.year,
      dateValue: 0,
    });
  });

  paymentItems.forEach(item => {
    const key = periodGroupKey(item.periodMonth, item.year);
    const row = grouped.get(key);
    if (!row) return;
    const payment = paymentsById.get(item.paymentId);
    const dateRaw = payment?.actualPaymentDate || payment?.paymentDate || item.createdAt;
    const dateTime = dateRaw ? new Date(dateRaw).getTime() : 0;
    if (dateTime >= row.dateValue) {
      row.dateValue = dateTime;
      row.writeOffDate = formatShortDate(dateRaw);
    }
  });

  return Array.from(grouped.values())
    .sort((a, b) => (a.rawYear - b.rawYear) || (a.rawMonth - b.rawMonth))
    .map(({ rawMonth: _rawMonth, rawYear: _rawYear, dateValue: _dateValue, ...row }) => row);
}

const inputStyle: React.CSSProperties = { height: 34, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 400, color: 'var(--text)', background: 'var(--surface)', boxSizing: 'border-box', boxShadow: 'var(--shadow-xs)' };

const financeLayoutStyle: React.CSSProperties = {
  display: 'grid',
  gap: 14,
};

const newPaymentGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 };




const smallAccentBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, height: 30, padding: '0 10px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', boxShadow: 'var(--shadow-xs)' };

const fileInputStyle: React.CSSProperties = { minWidth: 0, height: 34, display: 'flex', alignItems: 'center', gap: 7, padding: '0 10px', border: '1px dashed var(--border-strong)', borderRadius: 8, fontSize: 12.5, fontWeight: 500, color: 'var(--text-2)', background: 'var(--surface-2)', cursor: 'pointer', overflow: 'hidden' };

const paymentPanelStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, boxShadow: 'none' };

function submitPaymentBtnStyle(disabled: boolean): React.CSSProperties {
  return { gridColumn: '1 / -1', width: '100%', height: 36, border: '1px solid var(--accent-h)', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, boxShadow: 'var(--shadow-xs)' };
}

const paymentsListStyle: React.CSSProperties = {
  maxHeight: 260,
  overflowY: 'auto',
  paddingRight: 2,
};

const financeTableWrapStyle: React.CSSProperties = { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)' };

const financeTableStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 720,
  borderCollapse: 'collapse',
};

const financeThStyle: React.CSSProperties = { height: 38, padding: '0 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 12.5, fontWeight: 500, textAlign: 'left' };

const financeTdStyle: React.CSSProperties = { height: 44, padding: '8px 14px', borderBottom: '1px solid #EEF1F4', color: 'var(--text)', fontSize: 13, fontWeight: 400, fontVariantNumeric: 'tabular-nums' };

const financeTotalCellStyle: React.CSSProperties = { height: 42, padding: '8px 14px', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' };

const financeEmptyCellStyle: React.CSSProperties = { padding: '28px 14px', textAlign: 'center', color: 'var(--text-2)', fontSize: 13, fontWeight: 400 };

const receiptLinkStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 12.5, fontWeight: 500, color: 'var(--accent)', textDecoration: 'none' };

const iconBtnStyle: React.CSSProperties = { width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 };
