import ExcelJS from 'exceljs';
import { XLSX_BRAND } from './familiesRowHelpers';

export interface DirectoryRouteRow {
  childName: string;
  streetAddress: string;
  phone: string;
  secondPhone: string;
  contactPhone: string;
  stopNumber: string | null;
  status: string;
}

export interface DirectoryRouteMeta {
  school: string;
  transfer: string;
  driver: string;
  contacts: string;
  vehicle: string;
}

export interface DirectoryRouteSection {
  rows: DirectoryRouteRow[];
  meta: DirectoryRouteMeta;
}

function uniqueContacts(row: DirectoryRouteRow): string {
  return Array.from(new Set([row.phone, row.secondPhone, row.contactPhone].filter(Boolean))).join(' / ');
}

export function buildDirectoryRouteWorkbook(sections: DirectoryRouteSection[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OutWay CRM';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Маршрут', {
    pageSetup: {
      orientation: 'portrait',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0, footer: 0 },
    },
    views: [{ showGridLines: false }],
  });

  worksheet.columns = [{ width: 7 }, { width: 27 }, { width: 34 }, { width: 31 }];

  const thin = { style: 'thin' as const, color: { argb: XLSX_BRAND.border } };
  const borders = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });

  let nextSectionRow = 1;
  let lastSignatureRow = 1;
  const populatedSections = sections.filter(section => section.rows.some(row => row.status !== 'rejected'));

  populatedSections.forEach(section => {
    const routeRows = section.rows
      .filter(row => row.status !== 'rejected')
      .slice()
      .sort((a, b) => {
        const stopDiff = Number(a.stopNumber || 999) - Number(b.stopNumber || 999);
        return stopDiff || a.childName.localeCompare(b.childName, 'ru');
      });
    const sectionStartRow = nextSectionRow;

    worksheet.mergeCells(sectionStartRow, 1, sectionStartRow, 4);
    const title = worksheet.getCell(sectionStartRow, 1);
    title.value = 'OutWay  ·  Маршрутный лист';
    title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: XLSX_BRAND.white } };
    title.alignment = { vertical: 'middle', horizontal: 'center' };
    title.fill = fill(XLSX_BRAND.teal);
    worksheet.getRow(sectionStartRow).height = 24;

    const metaRows: Array<[number, string, string, string, string]> = [
      [sectionStartRow + 1, 'Школа', section.meta.school, 'Трансфер', section.meta.transfer],
      [sectionStartRow + 2, 'Водитель', section.meta.driver, 'Контакты', section.meta.contacts],
      [sectionStartRow + 3, '', '', 'Авто', section.meta.vehicle],
    ];
    metaRows.forEach(([rowNumber, leftLabel, leftValue, rightLabel, rightValue]) => {
      const values = [leftLabel, leftValue, rightLabel, rightValue];
      values.forEach((value, index) => {
        const cell = worksheet.getCell(rowNumber, index + 1);
        cell.value = value;
        cell.border = borders;
        cell.font = { name: 'Calibri', size: 10, color: { argb: XLSX_BRAND.text } };
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: index % 2 === 0 ? 0 : 1 };
        if (index % 2 === 0 && value) {
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: XLSX_BRAND.tealDark } };
          cell.fill = fill(XLSX_BRAND.mint);
        }
      });
      worksheet.getRow(rowNumber).height = 20;
    });

    worksheet.getRow(sectionStartRow + 4).height = 8;

    const headerRow = sectionStartRow + 5;
    const headerBottomRow = sectionStartRow + 6;
    ['№ остановки', 'ФИО ребёнка', 'Адрес', 'Контактные данные'].forEach((label, index) => {
      const column = index + 1;
      worksheet.mergeCells(headerRow, column, headerBottomRow, column);
      const cell = worksheet.getCell(headerRow, column);
      cell.value = label;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: XLSX_BRAND.white } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.fill = fill(XLSX_BRAND.teal);
      cell.border = borders;
    });
    worksheet.getRow(headerRow).height = 18;
    worksheet.getRow(headerBottomRow).height = 16;

    const firstDataRow = headerBottomRow + 1;
    routeRows.forEach((routeRow, index) => {
      const row = worksheet.getRow(firstDataRow + index);
      row.values = [routeRow.stopNumber || index + 1, routeRow.childName, routeRow.streetAddress, uniqueContacts(routeRow)];
      row.height = 24;

      for (let column = 1; column <= 4; column += 1) {
        const cell = row.getCell(column);
        cell.border = borders;
        cell.font = { name: 'Calibri', size: 10, color: { argb: XLSX_BRAND.text } };
        cell.alignment = column === 1
          ? { vertical: 'middle', horizontal: 'center' }
          : { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
        if (index % 2 === 1) cell.fill = fill(XLSX_BRAND.stripe);
      }
    });

    const signatureRow = firstDataRow + routeRows.length + 1;
    worksheet.mergeCells(signatureRow, 1, signatureRow, 2);
    const signature = worksheet.getCell(signatureRow, 1);
    signature.value = 'Подпись водителя: _______________________';
    signature.font = { name: 'Calibri', size: 10, italic: true, color: { argb: XLSX_BRAND.textMuted } };
    signature.alignment = { vertical: 'middle', horizontal: 'left' };
    worksheet.getRow(signatureRow).height = 22;

    lastSignatureRow = signatureRow;
    nextSectionRow = signatureRow + 2;
  });

  worksheet.pageSetup.printArea = `A1:D${lastSignatureRow}`;
  worksheet.views = populatedSections.length === 1
    ? [{ state: 'frozen', ySplit: 7, showGridLines: false }]
    : [{ showGridLines: false }];

  return workbook;
}
