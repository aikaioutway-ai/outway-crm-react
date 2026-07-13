import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';

export interface NotionSelectOption {
  value: string;
  label: string;
  color?: string;
  bg?: string;
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
  onEscape?: () => void;
  onClose?: () => void;
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
  onEscape,
  onClose,
}: NotionSelectProps) {
  const [open, setOpen] = useState(Boolean(autoFocus));
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find(option => option.value === value);

  const close = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const nextWidth = panelWidth ?? Math.max(rect.width, variant === 'cell' ? 220 : 190);
    setPanelStyle({
      position: 'fixed',
      left: Math.min(rect.left, window.innerWidth - nextWidth - 10),
      top: Math.min(rect.bottom + 6, window.innerHeight - 260),
      width: nextWidth,
      zIndex: 2400,
    });
  }, [open, panelWidth, variant]);

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

  const isCell = variant === 'cell';

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
        type="button"
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
        style={{
          width: '100%',
          height: isCell || open ? 38 : 24,
          border: open || isCell ? '1px solid #E5ECEF' : 'none',
          borderRadius: open || isCell ? 12 : 0,
          background: open || isCell ? '#fff' : 'transparent',
          color: '#17222F',
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
                color: '#17222F',
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
        <ChevronDown size={14} style={{ flexShrink: 0, color: '#626C8B' }} />
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={{
            ...panelStyle,
            maxHeight: 340,
            overflowY: 'auto',
            padding: '12px 12px 10px',
            border: '1px solid #E5ECEF',
            borderRadius: 10,
            background: '#fff',
            boxShadow: '0 16px 34px rgba(43, 72, 89, .16)',
          }}
          onClick={event => event.stopPropagation()}
        >
          <div style={{ color: '#777', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
            Select an option
          </div>
          <div style={{ display: 'grid', gap: 7 }}>
            {options.map((option, index) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    close();
                  }}
                  style={{
                    minHeight: 24,
                    border: 'none',
                    background: active ? '#EEF6F7' : index % 2 === 0 ? '#FAFCFC' : 'transparent',
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '2px 4px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ color: '#9B9B9B', fontSize: 16, lineHeight: 1 }}>⠿</span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      minHeight: 22,
                      maxWidth: '100%',
                      padding: 0,
                      borderRadius: 0,
                      background: 'transparent',
                      color: '#17222F',
                      fontSize: 14,
                      fontWeight: active ? 750 : 650,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
