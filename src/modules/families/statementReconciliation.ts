import type { FamilyPayment } from '../../types';

function cellText(cell: import('exceljs').Cell): string {
  return cell.value == null ? '' : cell.text.trim();
}

function codes(text: string) {
  return Array.from(new Set(Array.from(text.matchAll(/(?:MBIZ_S_|QR_452)\s*[a-f0-9](?:[-\s]*[a-f0-9]){31}(?![a-f0-9])/gi),
    ([code]) => code.toLowerCase().replace(/[-\s]/g, ''))));
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

export function reconcileBankStatement<T extends FamilyPayment>(entries: StatementEntry[], payments: T[]) {
  const indexed = payments.map(payment => ({ payment, codes: codes(payment.receiptCode ?? '') }));
  const exact = entries.map(entry => indexed.filter(item => entry.codes.some(code => item.codes.includes(code))));
  const claimed = new Set(exact.flatMap(matches => matches.map(({ payment }) => payment.id)));
  return entries.map((entry, index) => {
    const byCode = exact[index];
    const sameAmount = byCode.filter(({ payment }) => payment.amount === entry.amount);
    const matching = sameAmount.length ? sameAmount : byCode;
    if (matching.length) {
      return {
        entry, group: sameAmount.length ? '1' as const : '2' as const,
        candidates: matching.map(({ payment }) => payment),
        matchingCodes: entry.codes.filter(code => matching.some(item => item.codes.includes(code))),
      };
    }
    const candidates = payments.filter(payment =>
      !claimed.has(payment.id) && payment.amount === entry.amount &&
      (payment.actualPaymentDate ?? payment.paymentDate) === (entry.operationDate ?? entry.postingDate));
    return { entry, group: candidates.length ? '3' as const : 'Х' as const, candidates, matchingCodes: [] };
  });
}
