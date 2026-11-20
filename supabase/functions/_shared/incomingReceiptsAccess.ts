export const RECEIPT_ROLES = new Set(['admin', 'gen_director', 'director', 'manager', 'cashier']);
const LEADERSHIP = new Set(['admin', 'gen_director', 'director']);
/** Удаление файла навсегда — только руководство. */
export const canDeleteReceipts = (role: string) => LEADERSHIP.has(role);
export const RECEIPT_FILTERS = new Set(['review', 'submitted', 'duplicates', 'other', 'all']);

export type ReceiptBranch = { id: string; code: string | null; short_name: string | null; name: string | null };
export type ReceiptSchoolTab = { key: string; label: string; codes: string[]; branches: string[] };
export type ReceiptEmployee = { role: string; school_keys: string[] | null };

export function schoolKey(branch: ReceiptBranch, tabs: ReceiptSchoolTab[]): string {
  return tabs.find(tab => tab.key === branch.short_name || tab.label === branch.short_name || tab.branches.includes(branch.name ?? ''))?.key
    || tabs.find(tab => tab.codes.includes(branch.code ?? ''))?.key
    || '';
}

/** null означает доступ ко всем школам. */
export function allowedBranchIds(employee: ReceiptEmployee, branches: ReceiptBranch[], tabs: ReceiptSchoolTab[]): string[] | null {
  const keys = (employee.school_keys ?? []).map(key => key.toUpperCase());
  if (LEADERSHIP.has(employee.role) || !keys.length || keys.includes('ALL')) return null;
  return branches.filter(branch => keys.includes(schoolKey(branch, tabs).toUpperCase())).map(branch => branch.id);
}

export type ReceiptTransferCount = {
  transfer_id: string; branch_id: string | null; transfer_number: number | null;
  chat_id: string | null; group_name: string | null;
  review: number; duplicates: number; other: number; total: number;
};

/** Трансферы получают ключ школы; школы — сумму чеков своих трансферов. */
export function summarizeBySchool(transfers: ReceiptTransferCount[], branches: ReceiptBranch[], tabs: ReceiptSchoolTab[]) {
  const branchSchool = new Map(branches.map(branch => [branch.id, schoolKey(branch, tabs)]));
  const withSchool = transfers
    .map(transfer => ({ ...transfer, school_key: branchSchool.get(transfer.branch_id ?? '') ?? '' }))
    .filter(transfer => transfer.school_key);
  const schools = new Map<string, { key: string; transfers: number; linked: number; review: number; duplicates: number; other: number; total: number }>();
  for (const transfer of withSchool) {
    const school = schools.get(transfer.school_key) ?? { key: transfer.school_key, transfers: 0, linked: 0, review: 0, duplicates: 0, other: 0, total: 0 };
    school.transfers += 1;
    if (transfer.chat_id) school.linked += 1;
    school.review += transfer.review;
    school.duplicates += transfer.duplicates;
    school.other += transfer.other;
    school.total += transfer.total;
    schools.set(transfer.school_key, school);
  }
  return { schools: Array.from(schools.values()), transfers: withSchool };
}

export function parseReceiptEdit(input: { amount?: unknown; receiptDate?: unknown }): { amount?: number; receipt_date?: string } {
  const patch: { amount?: number; receipt_date?: string } = {};
  if (input.amount !== undefined) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Укажите сумму больше нуля');
    patch.amount = amount;
  }
  if (input.receiptDate !== undefined) {
    const date = String(input.receiptDate);
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new Error('Укажите дату чека');
    }
    patch.receipt_date = date;
  }
  return patch;
}
