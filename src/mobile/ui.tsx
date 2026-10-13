import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, MessageCircle, Phone, Search, X } from 'lucide-react';
import { formatPhone } from '../utils/format';
import { VEHICLE_COLOR } from '../core/dashboard/TransferCell';

export const CHILD_STATUS_OPTIONS = [
  { value: 'new', label: 'Новый' },
  { value: 'waiting', label: 'Ожидание' },
  { value: 'boarded', label: 'Посажен' },
  { value: 'paused', label: 'Пауза' },
  { value: 'rejected', label: 'Отказ' },
] as const;

export const CHILD_STATUS_TONE: Record<string, { bg: string; color: string }> = {
  new: { bg: '#E0F2F1', color: '#0F5F5F' },
  waiting: { bg: '#FEF3C7', color: '#92400E' },
  boarded: { bg: '#DCFCE7', color: '#166534' },
  paused: { bg: '#EDE9FE', color: '#5B21B6' },
  rejected: { bg: '#ECEFF3', color: '#52606F' },
};

export function StatusBadge({ status }: { status: string }) {
  const tone = CHILD_STATUS_TONE[status] ?? CHILD_STATUS_TONE.new;
  const label = CHILD_STATUS_OPTIONS.find(option => option.value === status)?.label ?? status;
  return <span className="m-badge" style={{ background: tone.bg, color: tone.color }}>{label}</span>;
}

export function Badge({ children, tone }: { children: React.ReactNode; tone?: { bg: string; color: string } }) {
  return <span className="m-badge" style={tone ? { background: tone.bg, color: tone.color } : undefined}>{children}</span>;
}

/** Цвета типов машин — те же, что у номеров трансферов в основной CRM. */
export function transferColor(vehicleType: string | null | undefined): string {
  return VEHICLE_COLOR[vehicleType ?? ''] ?? '#64748B';
}

/** Номер трансфера цветом типа машины, как в основной CRM. */
export function TransferChip({ number, vehicleType }: { number: string | null | undefined; vehicleType?: string | null }) {
  if (!number) return <span className="m-transfer-chip is-none">—</span>;
  return <span className="m-transfer-chip" style={{ background: transferColor(vehicleType) }}>{number}</span>;
}

export function TransferBadge({ number, vehicleType }: { number: string | null | undefined; vehicleType?: string | null }) {
  return number
    ? <Badge tone={{ bg: transferColor(vehicleType), color: '#FFFFFF' }}>Трансфер №{number}</Badge>
    : <Badge tone={{ bg: '#FFF1E6', color: '#B45309' }}>Без трансфера</Badge>;
}

export function SearchField({ value, onChange, placeholder = 'Поиск: имя или телефон' }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="m-search">
      <Search size={18} />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button type="button" className="m-search-clear" aria-label="Очистить поиск" onClick={() => onChange('')}>
          <X size={15} />
        </button>
      )}
    </label>
  );
}

export function Segment<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="m-segment" role="tablist">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={option.value === value ? 'is-active' : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/**
 * Выпадающий список. На телефоне открывается системный выбор
 * (барабан на iPhone, список на Android) — удобнее длинного ряда кнопок.
 */
export function SelectField<T extends string>({ label, value, onChange, options, disabled = false }: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  disabled?: boolean;
}) {
  const optionText = (option: SelectOption<T>) => (option.count !== undefined ? `${option.label} · ${option.count}` : option.label);
  const current = options.find(option => option.value === value);
  return (
    <label className={`m-select ${disabled ? 'is-disabled' : ''}`}>
      <span className="m-select-label">{label}</span>
      <span className="m-select-value">{current ? optionText(current) : '—'}</span>
      <select aria-label={label} value={value} disabled={disabled} onChange={event => onChange(event.target.value as T)}>
        {options.map(option => <option key={option.value} value={option.value}>{optionText(option)}</option>)}
      </select>
      <ChevronDown className="m-select-chevron" size={18} />
    </label>
  );
}

export function Kpi({ label, value, color, icon }: { label: string; value: React.ReactNode; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="m-kpi">
      <div className="m-kpi-value" style={color ? { color } : undefined}>{icon && <span className="m-kpi-icon">{icon}</span>}{value}</div>
      <div className="m-kpi-label">{label}</div>
    </div>
  );
}

export function Skeletons({ count = 5 }: { count?: number }) {
  return <div className="m-list">{Array.from({ length: count }, (_, index) => <div key={index} className="m-skeleton" />)}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="m-empty">{children}</div>;
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return <div className="m-error">{children}</div>;
}

/**
 * Длинные списки (тысячи детей) рисуются порциями: следующая порция
 * добавляется, когда пользователь докрутил до конца, — прокрутка остаётся плавной.
 */
export function useIncremental<T>(items: T[], step = 40): [T[], React.RefObject<HTMLDivElement | null>] {
  const [count, setCount] = useState(step);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setCount(step); }, [items, step]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || count >= items.length || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setCount(value => value + step);
    }, { rootMargin: '600px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [count, items.length, step]);

  return [items.slice(0, count), sentinelRef];
}

export function Sheet({ title, onClose, full = false, children, headerAction }: {
  title: React.ReactNode;
  onClose: () => void;
  full?: boolean;
  children: React.ReactNode;
  headerAction?: React.ReactNode;
}) {
  // Лист закрывается свайпом вниз за «ручку» или по тапу на затемнение.
  const startY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onTouchStart = (event: React.TouchEvent) => { startY.current = event.touches[0].clientY; };
  const onTouchMove = (event: React.TouchEvent) => {
    if (startY.current === null) return;
    setDragY(Math.max(0, event.touches[0].clientY - startY.current));
  };
  const onTouchEnd = () => {
    if (dragY > 90) onClose();
    startY.current = null;
    setDragY(0);
  };

  return (
    <>
      <div className="m-sheet-backdrop" onClick={onClose} />
      <div
        className={`m-sheet ${full ? 'm-sheet--full' : ''}`}
        role="dialog"
        aria-modal="true"
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div className="m-sheet-grip" />
          <div className="m-sheet-head">
            <div className="m-sheet-title">{title}</div>
            {headerAction}
            <button type="button" className="m-icon-btn" aria-label="Закрыть" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div className="m-sheet-body">{children}</div>
      </div>
    </>
  );
}

export function InfoRow({ label, value, action }: { label: string; value: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="m-info-row">
      <div className="m-info-main">
        <div className="m-info-label">{label}</div>
        <div className="m-info-value">{value || '—'}</div>
      </div>
      {action}
    </div>
  );
}

function phoneDigits(phone: string): string {
  return formatPhone(phone).replace(/\D/g, '');
}

/** Ссылка для звонка: иностранный номер без «+» иначе набирается как местный. */
function telHref(phone: string): string {
  const formatted = formatPhone(phone);
  if (formatted.startsWith('+')) return `tel:${formatted}`;
  const digits = formatted.replace(/\D/g, '');
  return `tel:${digits.length >= 11 ? `+${digits}` : digits}`;
}

/** Строка с телефоном: звонок и WhatsApp одним нажатием. */
export function PhoneRow({ label, phone }: { label: string; phone: string | null | undefined }) {
  if (!phone) return null;
  const formatted = formatPhone(phone);
  return (
    <InfoRow
      label={label}
      value={formatted}
      action={(
        <div style={{ display: 'flex', gap: 6 }}>
          <a className="m-icon-btn" href={`https://wa.me/${phoneDigits(phone)}`} target="_blank" rel="noreferrer" aria-label="Написать в WhatsApp">
            <MessageCircle size={18} />
          </a>
          <a className="m-icon-btn" href={telHref(phone)} aria-label="Позвонить">
            <Phone size={18} />
          </a>
        </div>
      )}
    />
  );
}

export function CallButton({ phone }: { phone: string | null | undefined }) {
  if (!phone) return null;
  return (
    <a className="m-icon-btn" href={telHref(phone)} aria-label="Позвонить" onClick={event => event.stopPropagation()}>
      <Phone size={18} />
    </a>
  );
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function todayIso(): string {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
