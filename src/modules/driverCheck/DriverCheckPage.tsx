import React, { useCallback, useEffect, useState } from 'react';
import { Check, MessageCircle, RefreshCw } from 'lucide-react';
import {
  buildDriverWhatsAppText,
  buildWhatsAppShareUrl,
  DriverCheckPayload,
  fetchDriverCheckList,
  formatBishkekTime,
  formatRuDate,
  roundOfIsoDate,
  submitDriverCheck,
  toggleDriverCheckMark,
} from '../../services/driverCheckService';
import './DriverCheckPage.css';

interface DriverCheckPageProps {
  token: string;
}

/**
 * Подменяем PWA-манифест под конкретную ссылку трансфера, чтобы при
 * «Добавить на экран Домой» иконка открывала именно список этого трансфера,
 * а не страницу входа в CRM.
 */
function applyDriverManifest(title: string) {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return undefined;
  const manifest = {
    short_name: title.slice(0, 20),
    name: `OutWay · ${title}`,
    icons: [
      { src: `${window.location.origin}/logo192.png?v=outway-2`, type: 'image/png', sizes: '192x192', purpose: 'any' },
      { src: `${window.location.origin}/logo512.png?v=outway-2`, type: 'image/png', sizes: '512x512', purpose: 'any' },
    ],
    start_url: window.location.href,
    display: 'standalone',
    theme_color: '#FFFFFF',
    background_color: '#F2F6F8',
    lang: 'ru',
  };
  const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
  let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  const previousHref = link?.getAttribute('href') ?? null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'manifest';
    document.head.appendChild(link);
  }
  link.href = blobUrl;
  return () => {
    URL.revokeObjectURL(blobUrl);
    if (link && previousHref) link.href = previousHref;
  };
}

export default function DriverCheckPage({ token }: DriverCheckPageProps) {
  const [data, setData] = useState<DriverCheckPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [pendingIds, setPendingIds] = useState<Record<string, boolean>>({});

  const loadList = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setLoadError('');
    try {
      const payload = await fetchDriverCheckList(token);
      setData(payload);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Не удалось загрузить список');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    void loadList(false);
  }, [loadList]);

  // При возврате в открытую вкладку подтягиваем свежий список из CRM (и сбрасываем галочки на новый день).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadList(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadList]);

  useEffect(() => {
    if (!data) return;
    const title = `${data.transfer.schoolLabel} №${data.transfer.transferNumber}`;
    document.title = `Трансфер ${title} — OutWay`;
    return applyDriverManifest(title);
  }, [data]);

  const handleToggle = async (childId: string) => {
    if (!data || pendingIds[childId]) return;
    const target = data.children.find(child => child.id === childId);
    if (!target) return;

    const nextPresent = !target.present;
    setSaveError('');
    setPendingIds(prev => ({ ...prev, [childId]: true }));

    // Мгновенно меняем галочку на экране, чтобы водителю не приходилось ждать ответа сети.
    setData(prev => prev ? {
      ...prev,
      children: prev.children.map(child => (
        child.id === childId ? { ...child, present: nextPresent } : child
      )),
    } : prev);

    try {
      const saved = await toggleDriverCheckMark(token, childId, nextPresent);
      setData(prev => prev ? {
        ...prev,
        date: saved.date,
        children: prev.children.map(child => (
          child.id === childId ? { ...child, present: saved.present, markedAt: saved.markedAt } : child
        )),
      } : prev);
    } catch (error) {
      setData(prev => prev ? {
        ...prev,
        children: prev.children.map(child => (
          child.id === childId ? { ...child, present: target.present } : child
        )),
      } : prev);
      setSaveError(error instanceof Error ? error.message : 'Не удалось сохранить отметку');
    } finally {
      setPendingIds(prev => {
        const next = { ...prev };
        delete next[childId];
        return next;
      });
    }
  };

  const handleSendWhatsApp = () => {
    if (!data) return;
    const text = buildDriverWhatsAppText(data);
    const url = buildWhatsAppShareUrl(text);

    // Фиксируем отправку в CRM параллельно, не задерживая переход в WhatsApp.
    void submitDriverCheck(token)
      .then(res => {
        setData(prev => prev ? { ...prev, submittedAt: res.submittedAt } : prev);
      })
      .catch(() => { /* отправке в WhatsApp не мешаем */ });

    window.location.href = url;
  };

  if (loading && !data) {
    return (
      <div className="dc-shell">
        <div className="dc-container">
          <div className="dc-state" role="status">
            <RefreshCw size={28} className="dc-spin" color="var(--accent, #0F766E)" />
            <h1 className="dc-state-title">Загружаем список детей…</h1>
            <p className="dc-state-text">Подождите пару секунд</p>
          </div>
        </div>
      </div>
    );
  }

  if (loadError && !data) {
    return (
      <div className="dc-shell">
        <div className="dc-container">
          <div className="dc-state" role="alert">
            <h1 className="dc-state-title">Список не открылся</h1>
            <p className="dc-state-text">{loadError}</p>
            <button type="button" className="dc-retry-btn" onClick={() => void loadList(false)}>
              Повторить
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const total = data.children.length;
  const presentCount = data.children.filter(child => child.present).length;
  const absentCount = total - presentCount;
  const percent = total > 0 ? Math.round((presentCount / total) * 100) : 0;
  const sentTime = formatBishkekTime(data.submittedAt);

  return (
    <div className="dc-shell">
      <div className="dc-container">
        <header className="dc-header">
          <div className="dc-header-top">
            <div className="dc-title-wrap">
              <h1 className="dc-title">
                {data.transfer.schoolLabel} · Трансфер №{data.transfer.transferNumber}
              </h1>
              <div className="dc-subtitle">
                {[formatRuDate(data.date), `Сверка ${roundOfIsoDate(data.date)}`, data.transfer.driverName].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button
              type="button"
              className="dc-refresh-btn"
              onClick={() => void loadList(true)}
              aria-label="Обновить список"
              title="Обновить список"
            >
              <RefreshCw size={18} className={refreshing ? 'dc-spin' : undefined} />
            </button>
          </div>

          <div className="dc-progress">
            <div className="dc-progress-row">
              <span className="dc-progress-count">Есть: {presentCount} из {total}</span>
              <span className="dc-progress-left">Нет: {absentCount}</span>
            </div>
            <div className="dc-progress-track" aria-hidden="true">
              <div className="dc-progress-fill" style={{ width: `${percent}%` }} />
            </div>
          </div>
        </header>

        {saveError && (
          <div className="dc-banner dc-banner--error" role="alert">
            <span>{saveError}</span>
          </div>
        )}

        {loadError && data && (
          <div className="dc-banner dc-banner--error" role="alert">
            <span>{loadError}</span>
          </div>
        )}

        {total === 0 ? (
          <div className="dc-state">
            <h2 className="dc-state-title">В трансфере пока нет детей</h2>
            <p className="dc-state-text">Когда логист добавит детей в этот трансфер, они появятся здесь автоматически.</p>
          </div>
        ) : (
          <main className="dc-list" aria-label="Список детей трансфера">
            {data.children.map((child, index) => (
              <button
                key={child.id}
                type="button"
                role="checkbox"
                aria-checked={child.present}
                className={`dc-item${child.present ? ' is-checked' : ''}`}
                onClick={() => void handleToggle(child.id)}
              >
                <span className="dc-index">{index + 1}</span>
                <span className="dc-main">
                  <div className="dc-name">{child.childName.trim() || 'Без имени'}</div>
                  <div className="dc-address">{child.address.trim() || 'Адрес не указан'}</div>
                </span>
                <span className="dc-checkbox" aria-hidden="true">
                  {child.present && <Check size={22} strokeWidth={3} />}
                </span>
              </button>
            ))}
          </main>
        )}
      </div>

      {total > 0 && (
        <footer className="dc-footer">
          <div className="dc-footer-inner">
            <button type="button" className="dc-wa-btn" onClick={handleSendWhatsApp}>
              <MessageCircle size={22} />
              Отправить список в WhatsApp
            </button>
            {sentTime && (
              <div className="dc-sent-note">Отправлено в WhatsApp в {sentTime}</div>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
