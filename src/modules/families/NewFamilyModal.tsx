import React from 'react';
import { X } from 'lucide-react';

const SCHOOL_LINKS: { name: string; code: string; url: string }[] = [
  { name: 'Edison',                    code: 'EDI',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1001' },
  { name: 'Эрудит-ISIT',              code: 'ERU',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1002' },
  { name: 'Тенсай',                   code: 'TIS',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1003' },
  { name: 'American-European School', code: 'AES',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1004' },
  { name: 'Kyrgyz-American School',   code: 'KAS',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1004' },
  { name: 'Билим Бишкек KG',          code: 'BKG',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1005' },
  { name: 'Индиго Kids',              code: 'ING',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1006' },
  { name: 'Nova International School',code: 'NOVA', url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1007' },
  { name: 'Эпсилон',                  code: 'EPS',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1008' },
  { name: 'Гениум Чуйкова',           code: 'GEN2', url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1009' },
  { name: 'Light Academy',            code: 'LA',   url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1010' },
  { name: 'Kings International School',code:'KNG',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1011' },
];

interface Props {
  onClose: () => void;
}

export default function NewFamilyModal({ onClose }: Props) {
  function openForm(url: string) {
    window.open(url, '_blank');
    onClose();
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 500 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 480, background: '#fff', zIndex: 501,
        borderRadius: 16, boxShadow: '0 20px 60px rgba(49,46,129,0.22)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ background: 'var(--accent)', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Новая заявка</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>Выберите школу — откроется форма</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
            <X size={16} />
          </button>
        </div>

        {/* School list */}
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '70vh', overflowY: 'auto' }}>
          {SCHOOL_LINKS.map(s => (
            <button
              key={s.code}
              onClick={() => openForm(s.url)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', background: '#F8F9FF',
                border: '1px solid var(--border)', borderRadius: 10,
                cursor: 'pointer', textAlign: 'left',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = '#EEF2FF';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = '#F8F9FF';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: 'var(--accent)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, flexShrink: 0,
                }}>
                  {s.code}
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{s.name}</span>
              </div>
              <span style={{ fontSize: 18, color: 'var(--accent)' }}>→</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
