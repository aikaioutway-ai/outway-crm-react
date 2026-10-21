export type TableExportValue = string | number | boolean | Date | null | undefined;

export async function downloadTableExcel(headers: string[], rows: TableExportValue[][], name = 'Таблица'): Promise<void> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Данные');
  sheet.addRow(headers);
  rows.forEach(row => sheet.addRow(row.map(value => value ?? '')));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  if (headers.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: headers.length } };
  sheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF187E83' } };
  });
  headers.forEach((header, index) => {
    sheet.getColumn(index + 1).width = Math.min(48, Math.max(14, header.length + 2, ...rows.slice(0, 200).map(row => String(row[index] ?? '').length + 2)));
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `${name.replace(/[\\/:*?"<>|]/g, '_')}.xlsx`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read only this table's cells; exclude nested tables and action-only columns. */
export function readTableForExport(table: HTMLTableElement): { headers: string[]; rows: string[][] } {
  const text = (cell: Element) => {
    const clone = cell.cloneNode(true) as HTMLElement;
    const originalControls = cell.querySelectorAll('input, textarea, select');
    clone.querySelectorAll('input, textarea, select').forEach((node, index) => {
      const control = originalControls[index] as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const value = control instanceof HTMLSelectElement ? control.selectedOptions[0]?.textContent ?? '' : control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type) ? (control.checked ? 'Да' : 'Нет') : control.value;
      node.replaceWith(document.createTextNode(value));
    });
    clone.querySelectorAll('svg, table, [aria-hidden="true"]').forEach(node => node.remove());
    return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
  };
  const head = Array.from(table.tHead?.rows ?? []).slice(-1)[0];
  const columns = Array.from(head?.cells ?? []).map((cell, index) => ({ index, label: text(cell) })).filter(column => column.label && !['Действия', 'Проверка'].includes(column.label));
  const rows = Array.from(table.tBodies).flatMap(body => Array.from(body.rows)).filter(row => row.closest('table') === table && Array.from(row.cells).every(cell => cell.colSpan === 1));
  return { headers: columns.map(column => column.label), rows: rows.map(row => columns.map(column => text(row.cells[column.index] ?? document.createElement('td')))) };
}
