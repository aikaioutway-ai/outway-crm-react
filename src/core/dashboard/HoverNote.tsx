import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Полупрозрачное окошко с текстом при наведении (и при фокусе с клавиатуры).
 * Без текста — просто показывает содержимое.
 */
export default function HoverNote({ note, children }: { note?: string | null; children: React.ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; above: boolean } | null>(null);
  if (!note) return <>{children}</>;
  const show = () => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const above = rect.bottom + 140 > window.innerHeight;
    setPosition({ left: Math.min(Math.max(rect.left + rect.width / 2, 150), window.innerWidth - 150), top: above ? rect.top - 8 : rect.bottom + 8, above });
  };
  const hide = () => setPosition(null);
  return (
    <span ref={anchor} tabIndex={0} aria-label={note} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
      style={{ display: 'inline-flex', outline: 'none' }}>
      {children}
      {position && createPortal(
        <div role="tooltip" style={{
          position: 'fixed', left: position.left, top: position.top, zIndex: 6000,
          transform: `translate(-50%, ${position.above ? '-100%' : '0'})`,
          maxWidth: 280, padding: '8px 11px', borderRadius: 10, pointerEvents: 'none',
          background: 'rgba(23, 34, 47, .82)', color: '#fff', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          boxShadow: '0 8px 24px rgba(15, 23, 42, .25)', fontSize: 12, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
        }}>{note}</div>,
        document.body,
      )}
    </span>
  );
}
