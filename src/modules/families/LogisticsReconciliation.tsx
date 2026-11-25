import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Link2,
  MessageCircle,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  canCorrectDriverMarks,
  canManageDriverLinks,
  correctDriverCheckMark,
  buildDriverCheckUrl,
  buildDriverInviteWhatsAppText,
  buildWhatsAppShareUrl,
  CHECK_ROUNDS,
  CheckRound,
  fetchLogisticsReconciliationMonth,
  formatBishkekTime,
  formatShortRuDate,
  ReconciliationMonthData,
  ReconciliationTransferMeta,
} from '../../services/driverCheckService';
import { useLogisticsTable } from '../../hooks/useCrmQueries';
import { ALL_PERIODS, isSchoolAllowed } from './constants';
import { VEHICLE_COLOR } from '../../core/dashboard/TransferCell';
import { formatName } from '../../utils/format';
import './LogisticsReconciliation.css';

export const RECONCILIATION_PERIODS = ALL_PERIODS.filter(period => period.key !== 'deposit');

export function resolveReconciliationPeriod(periodKey: string): { key: string; month: number; year: number; label: string } {
  return RECONCILIATION_PERIODS.find(period => period.key === periodKey) ?? RECONCILIATION_PERIODS[0];
}

interface LogisticsReconciliationProps {
  userId?: string;
  userRole?: string;
  schoolKey: string;
  periodKey: string;
  transferFilter?: string;
  search?: string;
  sessionToken?: string;
  allowedSchools?: string[];
  onTransferSelect?: (key: string) => void;
  onOpenFamily?: (familyId: string, childId: string) => void;
}

export default function LogisticsReconciliation({
  schoolKey,
  userId,
  userRole,
  periodKey,
  transferFilter = '',
  search = '',
  sessionToken,
  allowedSchools,
  onOpenFamily,
  onTransferSelect,
}: LogisticsReconciliationProps) {
  const queryClient = useQueryClient();
  const canCorrect = canCorrectDriverMarks(userId, userRole);
  // Менеджер видит сверку только на просмотр: ссылки водителей ему не выдаются.
  const showDriverLinks = !userRole || canManageDriverLinks(userRole);
  const [correcting, setCorrecting] = useState(false);
  const [correctionError, setCorrectionError] = useState('');
  const { data: logisticsRows, isPending: rowsPending } = useLogisticsTable();
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [linksOpen, setLinksOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!linksOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setLinksOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [linksOpen]);

  const period = useMemo(() => resolveReconciliationPeriod(periodKey), [periodKey]);
  const scopedSchool = schoolKey && schoolKey !== 'ALL' ? schoolKey : undefined;
  const queryKey = ['logistics-reconciliation-month', period.year, period.month, scopedSchool ?? 'ALL', sessionToken] as const;

  const { data: monthRaw, isFetching, isError, error, refetch } = useQuery<ReconciliationMonthData>({
    queryKey,
    queryFn: () => fetchLogisticsReconciliationMonth(sessionToken, {
      year: period.year,
      month: period.month,
      schoolKey: scopedSchool,
    }),
    enabled: Boolean(sessionToken),
    staleTime: 30_000,
  });
  const monthData = monthRaw as ReconciliationMonthData | undefined;

  const transferByKey = useMemo(() => {
    const map = new Map<string, ReconciliationTransferMeta>();
    for (const item of monthData?.transfers ?? []) {
      map.set(`${item.schoolKey}:${item.transferNumber}`, item);
    }
    return map;
  }, [monthData]);

  const activeTransfer = useMemo(() => {
    if (!scopedSchool || !/^\d+$/.test(transferFilter)) return null;
    return transferByKey.get(`${scopedSchool}:${Number(transferFilter)}`) ?? null;
  }, [scopedSchool, transferFilter, transferByKey]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (logisticsRows ?? []).filter(row => {
      if (row.rowId.endsWith('_empty')) return false;
      if (!isSchoolAllowed(row.branchFilter, allowedSchools)) return false;
      if (scopedSchool && row.branchFilter !== scopedSchool) return false;
      if (transferFilter === 'rejected') {
        if (row.status !== 'rejected') return false;
      } else {
        if (row.status === 'rejected') return false;
        if (transferFilter === 'empty' || transferFilter === 'new') {
          if (row.transferNumber) return false;
        } else if (/^\d+$/.test(transferFilter)) {
          if (String(row.transferNumber ?? '') !== transferFilter) return false;
        }
      }
      if (!q) return true;
      const hay = `${row.childName} ${row.parentName} ${row.streetAddress} ${row.phone} ${row.transferNumber ?? ''}`.toLowerCase();
      return hay.includes(q);
    });

    return [...list].sort((a, b) => {
      const aNum = Number(a.transferNumber || 999);
      const bNum = Number(b.transferNumber || 999);
      if (aNum !== bNum) return aNum - bNum;
      const aStop = Number(a.stopNumber || 999);
      const bStop = Number(b.stopNumber || 999);
      if (aStop !== bStop) return aStop - bStop;
      return a.childName.localeCompare(b.childName, 'ru');
    });
  }, [logisticsRows, allowedSchools, scopedSchool, transferFilter, search]);

  async function correctMark(transferId: string, childId: string, round: CheckRound, present: boolean | null) {
    if (!canCorrect || correcting) return;
    setCorrecting(true);
    setCorrectionError('');
    try {
      await correctDriverCheckMark(sessionToken, { transferId, childId, year: period.year, month: period.month, round, present });
      await queryClient.invalidateQueries({ queryKey: ['logistics-reconciliation-month'] });
    } catch (error) {
      setCorrectionError(error instanceof Error ? error.message : 'Не удалось исправить отметку');
    } finally {
      setCorrecting(false);
    }
  }

  const roundCounts = useMemo(() => {
    const counts: Record<CheckRound, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const marks = monthData?.marksByChild ?? {};
    for (const row of rows) {
      const childMarks = marks[row.rowId];
      if (!childMarks) continue;
      for (const { round } of CHECK_ROUNDS) {
        if (childMarks[round]?.present) counts[round] += 1;
      }
    }
    return counts;
  }, [rows, monthData]);

  const activeLinkUrl = activeTransfer ? buildDriverCheckUrl(activeTransfer.driverLinkToken) : '';

  const handleCopyLink = async () => {
    if (!activeLinkUrl) return;
    try {
      await navigator.clipboard.writeText(activeLinkUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Скопируйте ссылку трансфера для водителя:', activeLinkUrl);
    }
  };

  const showTransferPill = !/^\d+$/.test(transferFilter);

  const schoolTransfers = useMemo(() => {
    if (!monthData?.transfers) return [];
    if (scopedSchool) {
      return monthData.transfers.filter(t => t.schoolKey === scopedSchool);
    }
    return monthData.transfers;
  }, [monthData, scopedSchool]);

  const initializedSchool = useRef('');
  useEffect(() => {
    const key = `${scopedSchool}:${period.key}`;
    if (!monthData || !scopedSchool || initializedSchool.current === key) return;
    initializedSchool.current = key;
    const first = [...schoolTransfers].sort((a, b) => a.transferNumber - b.transferNumber)[0];
    if (!/^\d+$/.test(transferFilter) && first) onTransferSelect?.(String(first.transferNumber));
  }, [monthData, scopedSchool, period.key, schoolTransfers, transferFilter, onTransferSelect]);

  const handleCopyAnyLink = async (token: string, key: string) => {
    const url = buildDriverCheckUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(key);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      window.prompt('Скопируйте ссылку трансфера для водителя:', url);
    }
  };

  return (
    <div className="lr-wrap">
      {correctionError && <p role="alert">{correctionError}</p>}
      <div className="lr-bar">
        <div className="lr-bar-left">
          <span>{period.label}</span>
          <span>Детей: <strong>{rows.length}</strong></span>
          {activeTransfer && (
            <span className="lr-driver-chip">
              Трансфер №{activeTransfer.transferNumber}
              {activeTransfer.driverName ? ` · ${formatName(activeTransfer.driverName)}` : ' · водитель не назначен'}
            </span>
          )}
        </div>

        <div className="lr-bar-actions">
          {!showDriverLinks ? null : activeTransfer ? (
            <button type="button" className={`lr-btn lr-btn--primary${copied ? ' lr-btn--copied' : ''}`}
              onClick={() => void handleCopyLink()} title="Скопировать ссылку трансфера">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Скопировано' : `Ссылка трансфера №${activeTransfer.transferNumber}`}
            </button>
          ) : schoolTransfers.length > 0 ? (
            <div className="lr-dropdown-container" ref={dropdownRef}>
              <button
                type="button"
                className="lr-btn lr-btn--primary"
                onClick={() => setLinksOpen(v => !v)}
                title="Открыть список ссылок для всех водителей школы"
              >
                <Link2 size={14} />
                Ссылки водителей ({schoolTransfers.length})
                <ChevronDown size={14} className={linksOpen ? 'lr-rotate-180' : undefined} />
              </button>
              {linksOpen && (
                <div className="lr-dropdown-menu">
                  <div className="lr-dropdown-header">
                    Ссылки трансферов ({scopedSchool || 'Все'})
                  </div>
                  <div className="lr-dropdown-list">
                    {schoolTransfers.map(item => {
                      const itemUrl = buildDriverCheckUrl(item.driverLinkToken);
                      const isItemCopied = copiedId === item.transferId;
                      return (
                        <div key={item.transferId} className="lr-dropdown-item">
                          <div className="lr-dropdown-item-info">
                            <span className="lr-dropdown-num">№{item.transferNumber}</span>
                            <div className="lr-dropdown-meta">
                              <strong>Трансфер №{item.transferNumber}</strong>
                              <span>{item.driverName ? formatName(item.driverName) : 'Водитель не назначен'}</span>
                            </div>
                          </div>
                          <div className="lr-dropdown-item-actions">
                            <a
                              href={`/driver/${item.driverLinkToken}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="lr-btn lr-btn--sm"
                              title="Открыть страницу водителя"
                            >
                              <ExternalLink size={12} />
                              Открыть
                            </a>
                            <button
                              type="button"
                              className={`lr-btn lr-btn--sm${isItemCopied ? ' lr-btn--copied' : ''}`}
                              onClick={() => void handleCopyAnyLink(item.driverLinkToken, item.transferId)}
                              title="Скопировать ссылку"
                            >
                              {isItemCopied ? <Check size={12} /> : <Copy size={12} />}
                              {isItemCopied ? 'Скопировано' : 'Копировать'}
                            </button>
                            <a
                              href={buildWhatsAppShareUrl(buildDriverInviteWhatsAppText(item), item.driverPhone)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="lr-btn lr-btn--sm lr-btn--wa"
                              title={item.driverPhone ? `Отправить в WhatsApp (${item.driverPhone})` : 'Отправить в WhatsApp'}
                            >
                              <MessageCircle size={12} />
                              WhatsApp
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="lr-btn"
              disabled
              title="Выберите конкретный трансфер сверху, чтобы открыть ссылку для водителя"
            >
              <Link2 size={14} className={isFetching ? 'lr-spin' : undefined} />
              {isFetching ? 'Загрузка ссылок…' : /^\d+$/.test(transferFilter) ? 'Загрузка ссылки…' : 'Выберите трансфер для ссылки'}
            </button>
          )}

          <button
            type="button"
            className="lr-btn lr-btn--icon"
            onClick={() => void refetch()}
            disabled={isFetching}
            title="Обновить отметки"
            aria-label="Обновить отметки"
          >
            <RefreshCw size={14} className={isFetching ? 'lr-spin' : undefined} />
          </button>
        </div>
      </div>

      {isError && (
        <div className="lr-notice" role="alert">
          <span>{error instanceof Error ? error.message : 'Не удалось загрузить отметки сверки'}</span>
          <button type="button" className="lr-btn" onClick={() => void refetch()}>
            Повторить
          </button>
        </div>
      )}

      <div className="lr-table-wrap">
        {rowsPending && !logisticsRows ? (
          <div className="lr-empty" role="status">Загрузка списка…</div>
        ) : rows.length === 0 ? (
          <div className="lr-empty">В выбранном фильтре нет детей</div>
        ) : (
          <table className="lr-table" aria-label="Сверка детей по месяцам">
            <thead>
              <tr>
                <th className="lr-idx">№</th>
                <th>Ребёнок</th>
                {CHECK_ROUNDS.map(({ round, label, daysLabel }) => (
                  <th key={round} className="is-round">
                    <span className="lr-round-head">
                      <span>{label}</span>
                      <span className="lr-round-sub">{daysLabel}</span>
                      <span className="lr-round-stat">{roundCounts[round]} / {rows.length}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const displayName = /[\p{L}]/u.test(row.childName) ? formatName(row.childName) : 'Без имени';
                const childMarks = monthData?.marksByChild[row.rowId];
                const transferMeta = row.transferNumber
                  ? transferByKey.get(`${row.branchFilter}:${Number(row.transferNumber)}`)
                  : undefined;
                const pillColor = VEHICLE_COLOR[row.vehicleType as keyof typeof VEHICLE_COLOR] ?? '#0F766E';

                return (
                  <tr key={row.rowId}>
                    <td className="lr-idx">{row.stopNumber || index + 1}</td>
                    <td>
                      <div className="lr-child-cell">
                        <div className="lr-child-top">
                          {showTransferPill && row.transferNumber && (
                            <span className="lr-transfer-pill" style={{ background: pillColor }}>
                              №{row.transferNumber}
                            </span>
                          )}
                          {onOpenFamily ? (
                            <button
                              type="button"
                              className="lr-child-btn"
                              onClick={() => onOpenFamily(row.familyId, row.rowId)}
                            >
                              {displayName}
                            </button>
                          ) : (
                            <span className="lr-child-btn">{displayName}</span>
                          )}
                        </div>
                        {row.streetAddress && (
                          <div className="lr-child-addr">{row.streetAddress}</div>
                        )}
                      </div>
                    </td>
                    {CHECK_ROUNDS.map(({ round, label }) => {
                      const mark = childMarks?.[round];

                      if (canCorrect && transferMeta) {
                        return <td key={round} className="is-round">
                          <button type="button" className={`lr-mark ${!mark ? 'lr-mark--empty' : mark.present ? 'lr-mark--yes' : 'lr-mark--no'}`}
                            disabled={correcting} aria-label={`${label}: ${displayName}`} aria-pressed={Boolean(mark?.present)}
                            title="Галочка → крестик → сброс" onClick={() => void correctMark(transferMeta.transferId, row.rowId, round, !mark ? true : mark.present ? false : null)}>
                            {!mark ? '—' : mark.present ? <Check size={15} /> : <X size={14} />}
                          </button>
                        </td>;
                      }
                      if (mark?.present) {
                        const dt = [formatShortRuDate(mark.checkDate), formatBishkekTime(mark.markedAt)].filter(Boolean).join(' · ');
                        return (
                          <td key={round} className="is-round">
                            <span className="lr-mark lr-mark--yes" title={`${label}: отмечен (${dt})`}>
                              <Check size={15} strokeWidth={3} />
                            </span>
                          </td>
                        );
                      }
                      if (mark) {
                        return (
                          <td key={round} className="is-round">
                            <span className="lr-mark lr-mark--no" title={`${label}: не отмечен водителем`}>
                              <X size={14} strokeWidth={2.6} />
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td key={round} className="is-round">
                          <span className="lr-mark lr-mark--empty" title={`${label}: ещё не проводилась`}>—</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
