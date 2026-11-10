import type { FamilyPayment } from '../../types';
import { normalizeReceiptCode } from '../../services/receiptOcrResult';

function cellText(cell: import('exceljs').Cell): string {
  return cell.value == null ? '' : cell.text.trim();
}

// ID операций в строке выписки: у клиента Мбанка — MBIZ_S_<ID>/QR_452 <ID>,
// у клиента другого банка — ID операции его банка и QR_130 <ID>. Сравниваем по самим ID, без префиксов.
function codes(text: string) {
  return Array.from(new Set(Array.from(text.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi),
    ([code]) => code.toLowerCase().replace(/-/g, ''))));
}

function entryCodes(entry: StatementEntry) {
  const purpose = entry.source?.find(cell => cell.label === 'Назначение платежа')?.value;
  // Выписки, сохранённые до этого правила, хранят коды с префиксом mbiz_s_/qr_452.
  return purpose ? codes(purpose) : entry.codes.map(code => code.replace(/^(?:mbiz_s_|qr_452)/, ''));
}

// Дата оплаты в чеке — это дата операции. После подтверждения кассир ставит дату поступления,
// а она по умолчанию равна дате проводки в выписке, поэтому подходят обе.
function sameDate(entry: StatementEntry, payment: FamilyPayment) {
  return [entry.operationDate ?? entry.postingDate, entry.postingDate].includes(payment.actualPaymentDate ?? payment.paymentDate);
}

function minutes(time?: string) {
  const [hours, mins, seconds = 0] = time?.split(':').map(Number) ?? [];
  return hours == null || mins == null ? null : hours * 60 + mins + seconds / 60;
}

// Чек показывает время с точностью до минуты, а часы банков расходятся на минуту-две.
function sameTime(entry: StatementEntry, payment: FamilyPayment) {
  const entryTime = minutes(entry.time);
  const receiptTime = minutes(payment.receiptTime);
  return entryTime != null && receiptTime != null && Math.abs(entryTime - receiptTime) <= 3;
}

export async function readBankStatement(file: File) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = await new ExcelJS.Workbook().xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets.find(item => item.getColumn(1).values.includes('Документ'));
  if (!sheet) throw new Error('Не найден лист выписки Мбанка.');
  const header = sheet.getColumn(1).values.indexOf('Документ');
  const columns = sheet.getRow(header);
  if (cellText(columns.getCell(2)) !== 'Дата операции' ||
      cellText(columns.getCell(10)) !== 'Оборот Кт' ||
      cellText(columns.getCell(11)) !== 'Назначение платежа') {
    throw new Error('Проверьте формат выписки Мбанка.');
  }
  const labels = Array.from({ length: 11 }, (_, index) => cellText(columns.getCell(index + 1)));
  const entries = [];
  for (let number = header + 1; number <= sheet.rowCount; number++) {
    const row = sheet.getRow(number);
    const document = cellText(row.getCell(1));
    const postingDate = cellText(row.getCell(2));
    const date = postingDate.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!document.includes('№') || !date) continue;
    const amount = Number(cellText(row.getCell(10)).replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const purpose = cellText(row.getCell(11));
    const operation = purpose.match(/\b(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\b/);
    entries.push({
      number, document, amount, codes: codes(purpose),
      source: labels.map((label, index) => ({ label, value: cellText(row.getCell(index + 1)) })),
      postingDate: `${date[3]}-${date[2]}-${date[1]}`,
      operationDate: operation?.[1], time: operation?.[2],
    });
  }
  if (!entries.length) throw new Error('В выписке нет входящих зачислений.');
  const heading = sheet.getRows(1, header - 1)?.flatMap(row =>
    Array.from({ length: row.cellCount }, (_, index) => cellText(row.getCell(index + 1))))
    .find(value => value.includes('За период'));
  const range = typeof heading === 'string' && heading.match(/с\s+(\d{2}\.\d{2}\.\d{4})\s+по\s+(\d{2}\.\d{2}\.\d{4})/);
  return { entries, range: range ? {
    from: range[1].split('.').reverse().join('-'),
    to: range[2].split('.').reverse().join('-'),
  } : undefined };
}

type ImportedEntry = Awaited<ReturnType<typeof readBankStatement>>['entries'][number];
export type StatementEntry = Omit<ImportedEntry, 'source'> & Partial<Pick<ImportedEntry, 'source'>>;

// Повторно загруженные выписки пересекаются (например, 7–10 и 10–15 число): одинаковые строки берём один раз.
export function mergeStatements(statements: Array<{ entries: StatementEntry[] }>): StatementEntry[] {
  const seen = new Set<string>();
  const merged: StatementEntry[] = [];
  for (const statement of statements) {
    for (const entry of statement.entries) {
      const purpose = entry.source?.find(cell => cell.label === 'Назначение платежа')?.value ?? entry.codes.join(',');
      const key = [entry.document.replace(/\s+/g, ' '), entry.postingDate, entry.amount, purpose].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...entry, number: merged.length + 1 });
    }
  }
  return merged;
}

// 1 — есть: код и сумма совпали; 2 — частично: код совпал, а сумма нет, или совпали только сумма и дата;
// Д — дубли: один и тот же чек привязан к нескольким платежам CRM, подтверждать можно только один; Х — нет.
export function reconcileBankStatement<T extends FamilyPayment>(entries: StatementEntry[], payments: T[]) {
  const byCode = new Map<string, Array<{ payment: T; codes: string[] }>>();
  for (const payment of payments) {
    const item = { payment, codes: codes(normalizeReceiptCode(payment.receiptCode) ?? payment.receiptCode ?? '') };
    for (const code of item.codes) byCode.set(code, [...(byCode.get(code) ?? []), item]);
  }
  const byAmount = new Map<number, T[]>();
  for (const payment of payments) byAmount.set(payment.amount, [...(byAmount.get(payment.amount) ?? []), payment]);
  const statementCodes = entries.map(entryCodes);
  const exact = statementCodes.map(list => Array.from(new Set(list.flatMap(code => byCode.get(code) ?? []))));
  const claimed = new Set(exact.flatMap(matches => matches.map(({ payment }) => payment.id)));
  const byAmountAndDate = entries.map((entry, index) => exact[index].length ? [] : (byAmount.get(entry.amount) ?? [])
    .filter(payment => !claimed.has(payment.id) && sameDate(entry, payment)));
  // Если время чека совпало с одной строкой выписки, этот чек не предлагаем другим строкам с той же суммой.
  const timed = byAmountAndDate.map((candidates, index) => candidates.filter(payment => sameTime(entries[index], payment)));
  const reservedByTime = new Set(timed.flat().map(payment => payment.id));
  return entries.map((entry, index) => {
    const matches = exact[index];
    const sameAmount = matches.filter(({ payment }) => payment.amount === entry.amount);
    const matching = sameAmount.length ? sameAmount : matches;
    if (matching.length) {
      return {
        entry, group: matching.length > 1 ? 'Д' as const : sameAmount.length ? '1' as const : '2' as const,
        candidates: matching.map(({ payment }) => payment),
        matchingCodes: statementCodes[index].filter(code => matching.some(item => item.codes.includes(code))),
      };
    }
    const candidates = timed[index].length ? timed[index]
      : byAmountAndDate[index].filter(payment => !reservedByTime.has(payment.id));
    return { entry, group: candidates.length ? '2' as const : 'Х' as const, candidates, matchingCodes: [] as string[] };
  });
}
