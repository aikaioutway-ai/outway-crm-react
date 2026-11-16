import type { FamilyListRow } from '../../services/crmV2Service';
import { isNewUnassignedRow } from '../families/familiesRowHelpers';
import { transferStats } from '../families/LogisticsOverview';
import { requestStage } from '../families/requestWorkflow';

// Ключи ABL в справочнике: ABL2 — Мавлянова, ABL1 — АБЛ №2.
export const SUMMARY_GROUPS = [
  { key: 'group-1', label: 'Группа №1', manager: 'Айнура', logistics: 'Асылбек', schools: ['TIS', 'LA', 'LA_P', 'EPS', 'ABL2', 'GEN4'] },
  { key: 'group-2', label: 'Группа №2', manager: 'Аяна', logistics: 'Максат · АБЛ №2: Адилет', schools: ['ABL1', 'ING', 'ING_W', 'ERU', 'EDI', 'KAS', 'BKG', 'BJ'] },
  { key: 'group-3', label: 'Группа №3', manager: 'Медина', logistics: 'Адилет · АЕС: Максат', schools: ['AES', 'NOVA', 'ELS', 'GEN2', 'SNP'] },
];

export function groupStats(rows: FamilyListRow[]) {
  const unique = Array.from(new Map(rows.map(row => [row.rowId, row])).values());
  const pendingByFamily = new Map(unique.map(row => [row.familyId, row.pendingPaymentCount]));
  const active = unique.filter(row => row.status !== 'rejected');
  const families = new Map(active.map(row => [row.familyId, row.debtAmount]));
  const debts = Array.from(families.values()).filter(debt => debt > 0);
  return {
    ...transferStats(unique),
    newRequests: unique.filter(row => isNewUnassignedRow(row) && requestStage(row) === 'new').length,
    pendingChecks: Array.from(pendingByFamily.values()).reduce((sum, count) => sum + count, 0),
    debtorsCount: debts.length,
    debtSum: debts.reduce((sum, debt) => sum + debt, 0),
  };
}


export const SUMMARY_SCHOOL_NAMES: Record<string, string> = {
  TIS: 'Тенсай', LA: 'Лайт Академия', LA_P: 'Лайт Академия — начальная школа',
  EPS: 'Эпсилон', ABL2: 'Академия будущих лидеров — Мавлянова',
  GEN4: 'Гениум — Авангард', ABL1: 'Академия будущих лидеров №2 — Байтик Батыр',
  ING: 'Индиго', ING_W: 'Индиго — West', ERU: 'Эрудит', EDI: 'Эдисон',
  KAS: 'Kyrgyz-American School', BKG: 'Билим Бишкек KG', BJ: 'Билим Жолу',
  AES: 'American-European School', NOVA: 'Nova International School',
  ELS: 'Ellipse International School', GEN2: 'Гениум — Чуйкова', SNP: 'Международная школа Сан Арип',
};
