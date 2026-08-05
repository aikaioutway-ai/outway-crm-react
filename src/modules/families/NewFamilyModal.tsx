import React, { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';

const SCHOOL_LINKS: { name: string; code: string; url: string; logo: string }[] = [
  { name: 'Edison',                     code: 'EDISON',  logo: '/school-logos/EDI.png',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1001' },
  { name: 'Эрудит-ISIT',                code: 'ERUDIT',  logo: '/school-logos/ERU.png',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1002' },
  { name: 'Тенсай',                     code: 'TENSAY',  logo: '/school-logos/TIS.png',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1003' },
  { name: 'American-European School',   code: 'AES',     logo: '/school-logos/AES.png',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1004' },
  { name: 'Kyrgyz-American School',     code: 'KAS',     logo: '/school-logos/KAS.png',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1004' },
  { name: 'Билим Бишкек KG',            code: 'BILIM',   logo: '/school-logos/BKG.png',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1005' },
  { name: 'Индиго Kids',                code: 'INDIGO',  logo: '/school-logos/ING.png',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1006' },
  { name: 'Nova International School',  code: 'NOVA',    logo: '/school-logos/NOVA.png', url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1007' },
  { name: 'Эпсилон',                    code: 'EPSILON', logo: '/school-logos/EPS.png',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1008' },
  { name: 'Гениум Чуйкова',             code: 'GENIUS',  logo: '/school-logos/GEN.png',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1009' },
  { name: 'Light Academy',              code: 'LIGHT',   logo: '/school-logos/LA.png',   url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1010' },
  { name: 'Академия будущих лидеров',   code: 'ABL',     logo: '/school-logos/ABL.png',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1014' },
  { name: 'Калем Академи Скуул',        code: 'KLM',     logo: '/school-logos/KLM.png',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1015' },
  { name: 'Tesla Academy',              code: 'TSL',     logo: '/school-logos/TSL.png',  url: 'https://clinquant-sprite-ec8c20.netlify.app/?s=1016' },
];

interface Props { onClose: () => void; }

export default function NewFamilyModal({ onClose }: Props) {
  const [selected, setSelected] = useState('');
  const [open, setOpen]         = useState(false);

  const school = SCHOOL_LINKS.find(s => s.code === selected);

  function handleOpen() {
    if (!school) return;
    window.open(school.url, '_blank');
    onClose();
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 500 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 420, background: '#fff', zIndex: 501,
        borderRadius: 16, boxShadow: '0 20px 60px rgba(49,46,129,0.22)',
        overflow: 'visible',
      }}>
        {/* Header */}
        <div style={{ background: 'var(--accent)', padding: '18px 22px', borderRadius: '16px 16px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Новая заявка</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>Выберите школу</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 20px 24px', position: 'relative' }}>

          {/* Custom select */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <div
              onClick={() => setOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 14px', height: 48,
                border: `2px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 10, cursor: 'pointer', background: '#fff',
                transition: 'border-color 0.15s',
              }}
            >
              {school ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img src={school.logo} alt="" style={{ width: 32, height: 32, borderRadius: 7, objectFit: 'contain', background: '#fff', border: '1px solid var(--border)', flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{school.name}</span>
                </div>
              ) : (
                <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Выберите школу...</span>
              )}
              <ChevronDown size={16} color="var(--text-2)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </div>

            {/* Dropdown */}
            {open && (
              <>
                <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                  background: '#fff', borderRadius: 12, zIndex: 11,
                  boxShadow: '0 8px 32px rgba(49,46,129,0.16)',
                  border: '1px solid var(--border)',
                  overflow: 'hidden', maxHeight: 360, overflowY: 'auto',
                }}>
                  {SCHOOL_LINKS.map((s, i) => (
                    <div
                      key={s.code + i}
                      onClick={() => { setSelected(s.code); setOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 14px', cursor: 'pointer',
                        background: selected === s.code ? '#EEF2FF' : i % 2 === 0 ? '#fff' : '#F8F9FF',
                        borderLeft: selected === s.code ? '3px solid var(--accent)' : '3px solid transparent',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (selected !== s.code) (e.currentTarget as HTMLDivElement).style.background = '#F0F4FF'; }}
                      onMouseLeave={e => { if (selected !== s.code) (e.currentTarget as HTMLDivElement).style.background = i % 2 === 0 ? '#fff' : '#F8F9FF'; }}
                    >
                      <img src={s.logo} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'contain', background: '#fff', border: '1px solid var(--border)', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: selected === s.code ? 700 : 500, color: 'var(--text)' }}>{s.name}</span>
                      {selected === s.code && <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: 14 }}>✓</span>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Button */}
          <button
            onClick={handleOpen}
            disabled={!school}
            style={{
              width: '100%', height: 48,
              background: school ? 'var(--accent)' : '#E5E7EB',
              color: school ? '#fff' : '#9CA3AF',
              border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 700, cursor: school ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {school ? `Открыть форму — ${school.name} →` : 'Сначала выберите школу'}
          </button>
        </div>
      </div>
    </>
  );
}
