import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './NotionSelect.css';
import { Check, ChevronDown, X } from 'lucide-react';

export interface NotionSelectOption {
  value: string;
  label: string;
  color?: string;
  bg?: string;
  badge?: string;
}

interface NotionSelectProps {
  value: string;
  options: NotionSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  variant?: 'cell' | 'inline';
  width?: number | string;
  panelWidth?: number;
  autoFocus?: boolean;
  inlinePanel?: boolean;
  modalPanel?: boolean;
  onEscape?: () => void;
  onClose?: () => void;
  ariaLabel?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  footerAction?: { label: string; onClick: () => void };
}

export default function NotionSelect({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = 'Выбрать',
  variant = 'inline',
  width,
  panelWidth,
  autoFocus,
  inlinePanel = false,
  modalPanel = false,
  onEscape,
  onClose,
  ariaLabel,
  footerAction,
  searchable=false,
  searchPlaceholder='Поиск',
}: NotionSelectProps) {
  const [open, setOpen] = useState(Boolean(autoFocus));
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [search,setSearch]=useState('');
  const hasFooter=Boolean(footerAction) || searchable;
  const selected = options.find(option => option.value === value);

  const close = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);

  useLayoutEffect(() => {
    if (!open || inlinePanel || modalPanel || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const nextWidth = panelWidth ?? Math.max(rect.width, variant === 'cell' ? 220 : 190);
    setPanelStyle({
      position: 'fixed',
      left: Math.min(rect.left, window.innerWidth - nextWidth - 10),
      top: Math.max(10, Math.min(rect.bottom + 6, window.innerHeight - (hasFooter ? Math.min(340,window.innerHeight-20) : 260) - 10)),
      width: nextWidth,
      zIndex: 2400,
    });
  }, [open, panelWidth, variant, hasFooter, inlinePanel, modalPanel]);

  useEffect(() => {
    if (!autoFocus) return;
    buttonRef.current?.focus();
    setOpen(true);
  }, [autoFocus]);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        onEscape?.();
      }
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [close, onEscape, open]);

  useEffect(() => { if (!modalPanel || !open) return; const previous = document.activeElement as HTMLElement | null; panelRef.current?.querySelector<HTMLInputElement>('input')?.focus(); return () => previous?.focus(); }, [modalPanel, open]);
  const isCell = variant === 'cell';
  const renderPanel = (content: React.ReactElement) => modalPanel ? createPortal(<div className="notion-select-modal-overlay" onMouseDown={event => { if(event.target === event.currentTarget) close(); }} onKeyDown={event => { event.stopPropagation(); if(event.key === 'Escape') close(); if(event.key === 'Tab') { const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button,input') || []); const first = nodes[0], last = nodes[nodes.length - 1]; if(event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if(!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }}>{content}</div>, document.body) : inlinePanel ? content : createPortal(content, document.body);

  return (
    <div
      ref={rootRef}
      onClick={event => event.stopPropagation()}
      style={{
        position: isCell ? 'absolute' : 'relative',
        left: isCell ? -2 : undefined,
        top: isCell ? '50%' : undefined,
        transform: isCell ? 'translateY(-50%)' : undefined,
        width: width ?? (isCell ? 'calc(100% + 4px)' : '100%'),
        minWidth: isCell ? 180 : 0,
        zIndex: open ? 80 : 1,
      }}
    >
      <button
        ref={buttonRef}
        className="notion-select-trigger"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        type="button"
        disabled={disabled}
        onClick={() => { if (open) close(); else {setSearch('');setOpen(true);} }}
        style={{
          width: '100%',
          height: isCell ? 38 : 24,
          border: open || isCell ? '1px solid #E5ECEF' : 'none',
          borderRadius: open || isCell ? 12 : 0,
          background: open || isCell ? '#fff' : 'transparent',
          color: 'var(--text)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: open || isCell ? '0 10px 0 12px' : '0 0',
          fontSize: open || isCell ? 13 : 11,
          fontWeight: open || isCell ? 750 : 850,
          outline: 'none',
          cursor: disabled ? 'default' : 'pointer',
          boxShadow: open || isCell ? '0 16px 34px rgba(43, 72, 89, .16)' : 'none',
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            maxWidth: open || isCell ? 'calc(100% - 22px)' : 'calc(100% - 16px)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            minWidth: 0,
          }}
        >
          {selected ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                maxWidth: '100%',
                minWidth: 0,
                height: 22,
                padding: 0,
                borderRadius: 0,
                background: 'transparent',
                color: 'var(--text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selected.label}
              {isCell && <X size={13} style={{ marginLeft: 5, opacity: 0.45, flexShrink: 0 }} />}
            </span>
          ) : (
            <span style={{ color: '#8A93A3' }}>{placeholder}</span>
          )}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, color: 'var(--text-2)' }} />
      </button>

      {open && !disabled && renderPanel(
        <div
          ref={panelRef}
          className="notion-select-panel"
          role={hasFooter ? "dialog" : "listbox"}
          aria-modal={modalPanel || undefined}
          aria-label={modalPanel ? "Выбор водителя" : "Выберите вариант"}
          style={{
            ...(modalPanel ? { position: 'relative' as const, width: 'min(560px, calc(100vw - 32px))' } : inlinePanel ? { position: 'relative' as const, width: '100%', marginTop: 6 } : panelStyle),
            maxHeight: modalPanel ? '85dvh' : 340,
            overflowY: hasFooter ? 'hidden' : 'auto',
            padding: '12px 12px 10px',
            border: '1px solid #E5ECEF',
            borderRadius: 10,
            background: '#fff',
            boxShadow: '0 16px 34px rgba(43, 72, 89, .16)',
          }}
          onClick={event => event.stopPropagation()}
        >
          {modalPanel && <div className="notion-select-modal-head"><strong>Выбор водителя</strong><button type="button" aria-label="Закрыть выбор водителя" onClick={close}><X size={18}/></button></div>}
          {!searchable && <div style={{ color: '#777', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
            Выберите вариант
          </div>}
          {searchable && <>
            {selected && <button type="button" className="notion-select-current" onClick={close}><Check size={15}/>{selected.label}</button>}
            <input className="notion-select-search" aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={search} onChange={event=>setSearch(event.target.value)}/>
          </>}
          <div role={hasFooter?'listbox':undefined} style={{ display: 'grid', gridTemplateColumns:'minmax(0,1fr)', gap: 7, maxHeight: hasFooter ? Math.min(modalPanel ? 360 : searchable?170:230,window.innerHeight-200) : undefined, overflowY: hasFooter ? 'auto' : undefined }}>
            {options.filter(option=>!searchable || option.value!==value && (`${option.label} ${option.badge || ''}`).toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))).map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  className="notion-select-option"
                  role="option"
                  aria-selected={active}
                  onKeyDown={event => {
                    const items = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('.notion-select-option') ?? []);
                    const index = items.indexOf(event.currentTarget);
                    const next = event.key === 'ArrowDown' ? (index + 1) % items.length
                      : event.key === 'ArrowUp' ? (index - 1 + items.length) % items.length
                      : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1;
                    if (next >= 0) { event.preventDefault(); items[next]?.focus(); }
                  }}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    close();
                  }}
                  style={{
                    minHeight: 32,
                    minWidth: 0,
                    border: 'none',

                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '5px 8px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span aria-hidden="true" style={{ width: 16, flexShrink: 0, display: 'flex', color: 'var(--accent)' }}>{active && <Check size={15} />}</span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      minHeight: 22,
                      maxWidth: '100%',
                      padding: 0,
                      borderRadius: 0,
                      background: 'transparent',
                      color: 'var(--text)',
                      fontSize: 14,
                      fontWeight: active ? 750 : 650,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {option.label}
                  </span>
                  {option.badge && <small className="notion-select-option-badge">{option.badge}</small>}
                </button>
              );
            })}
          </div>
          {footerAction && <button type="button" className="notion-select-footer" onClick={()=>{close();footerAction.onClick();}}>{footerAction.label}</button>}
        </div>
      )}
    </div>
  );
}
