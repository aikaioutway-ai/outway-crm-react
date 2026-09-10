import type { B2BClientRecord, B2BDriverPayoutRecord, B2BExpenseRecord, B2BOrderRecord } from '../../services/b2bDataService';
import type { B2BPaymentRecord } from '../../services/b2bPaymentService';
import { formatB2BPaymentMethod } from '../../services/b2bPaymentService';
import { calculateB2BOrderProfit } from './b2bProfitCalculations';

export type B2BExportTab = 'cashier' | 'orders' | 'logistics' | 'calendar' | 'clients' | 'expenses' | 'finance' | 'cashflow';

export interface B2BExportData {
  orders: B2BOrderRecord[];
  clients: B2BClientRecord[];
  payments: B2BPaymentRecord[];
  payouts: B2BDriverPayoutRecord[];
  expenses: B2BExpenseRecord[];
}

type ExportValue = string | number | Date;

interface ExportColumn {
  header: string;
  width: number;
  kind?: 'date' | 'money' | 'percent' | 'id';
}

export interface B2BExportSheet {
  name: string;
  columns: ExportColumn[];
  rows: ExportValue[][];
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Новый', in_progress: 'В работе', completed: 'Завершён', cancelled: 'Отменён',
  driver_assigned: 'Водитель назначен', trip_completed: 'Выезд завершён', ready_to_close: 'Готов к закрытию', success: 'Успешно',
  pending: 'На проверке', confirmed: 'Подтверждено', rejected: 'Отклонено',
};

const CLIENT_TYPE_LABELS: Record<string, string> = { individual: 'Частный', company: 'Юридическое лицо', school: 'Школа' };

function isoDate(value: string | null | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

function excelDate(value: string | null | undefined): Date | string {
  const normalized = isoDate(value);
  if (!normalized) return value || '';
  const [year, month, day] = normalized.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function inPeriod(value: string | null | undefined, dateFrom: string, dateTo: string): boolean {
  const normalized = isoDate(value);
  return Boolean(normalized && normalized >= dateFrom && normalized <= dateTo);
}

function orderDate(order: B2BOrderRecord): string {
  return order.departureDate || order.requestDate;
}

function orderRowsForPeriod(data: B2BExportData, dateFrom: string, dateTo: string) {
  return data.orders.filter(order => inPeriod(orderDate(order), dateFrom, dateTo));
}

const orderColumns: ExportColumn[] = [
  { header: 'Заказ', width: 18 }, { header: 'Клиент', width: 28 }, { header: 'Дата заявки', width: 14, kind: 'date' },
  { header: 'Дата выезда', width: 14, kind: 'date' }, { header: 'Откуда', width: 26 }, { header: 'Куда', width: 26 },
  { header: 'Транспорт', width: 18 }, { header: 'Количество', width: 12 }, { header: 'Цена за единицу', width: 17, kind: 'money' },
  { header: 'Сумма заказа', width: 17, kind: 'money' }, { header: 'Поступило', width: 16, kind: 'money' },
  { header: 'Остаток клиента', width: 18, kind: 'money' }, { header: 'Водитель', width: 24 },
  { header: 'Цена водителю за единицу', width: 23, kind: 'money' }, { header: 'Начислено водителю', width: 21, kind: 'money' },
  { header: 'Статус', width: 21 }, { header: 'ID заказа', width: 38, kind: 'id' }, { header: 'ID клиента', width: 38, kind: 'id' },
  { header: 'ID назначения водителя', width: 38, kind: 'id' }, { header: 'ID водителя', width: 38, kind: 'id' },
];

function buildOrderRows(data: B2BExportData, dateFrom: string, dateTo: string): ExportValue[][] {
  return orderRowsForPeriod(data, dateFrom, dateTo).map(order => {
    const received = data.payments.filter(payment => payment.orderId === order.id && payment.status === 'confirmed').reduce((sum, payment) => sum + payment.amount, 0);
    const driverTotal = order.driverTotal ?? (order.driverPricePerUnit ?? 0) * order.transportCount;
    return [
      order.number, order.client, excelDate(order.requestDate), excelDate(order.departureDate), order.routeFrom, order.routeTo,
      order.transport, order.transportCount, order.pricePerUnit, order.total, received, Math.max(order.total - received, 0),
      order.driverName, order.driverPricePerUnit ?? 0, driverTotal, STATUS_LABELS[order.status] ?? order.status,
      order.id, order.clientId, order.assignmentId ?? '', order.driverId ?? '',
    ];
  });
}

function buildCashflowSheets(data: B2BExportData, dateFrom: string, dateTo: string): B2BExportSheet[] {
  const ordersById = new Map(data.orders.map(order => [order.id, order]));
  const ordersByNumber = new Map(data.orders.map(order => [order.number, order]));
  const incomeColumns: ExportColumn[] = [
    { header: 'Дата поступления', width: 17, kind: 'date' }, { header: 'Клиент / компания', width: 30 },
    { header: 'Заказ', width: 18 }, { header: 'Сумма', width: 16, kind: 'money' }, { header: 'Способ оплаты', width: 27 },
    { header: 'Платёжное поручение', width: 22 }, { header: 'Назначение / комментарий', width: 38 },
    { header: 'Статус', width: 18 }, { header: 'ID платежа', width: 38, kind: 'id' }, { header: 'ID заказа', width: 38, kind: 'id' },
  ];
  const incomeRows: ExportValue[][] = data.payments.filter(payment => inPeriod(payment.paymentDate, dateFrom, dateTo)).map(payment => [
    excelDate(payment.paymentDate), payment.clientName, payment.orderNumber, payment.amount, formatB2BPaymentMethod(payment.method),
    payment.paymentOrderNumber ?? '', payment.comment, STATUS_LABELS[payment.status] ?? payment.status, payment.id, payment.orderId,
  ]);

  const expenseColumns: ExportColumn[] = [
    { header: 'Дата выплаты', width: 17, kind: 'date' }, { header: 'Вид выплаты', width: 20 }, { header: 'Получатель / назначение', width: 32 },
    { header: 'Клиент / компания', width: 28 }, { header: 'Заказ', width: 18 }, { header: 'Сумма', width: 16, kind: 'money' },
    { header: 'Способ оплаты', width: 27 }, { header: 'Платёжное поручение', width: 22 }, { header: 'Комментарий', width: 38 },
    { header: 'ID записи', width: 38, kind: 'id' }, { header: 'ID заказа', width: 38, kind: 'id' }, { header: 'ID источника', width: 38, kind: 'id' },
  ];
  const payoutRows: ExportValue[][] = data.payouts.filter(payout => inPeriod(payout.paymentDate, dateFrom, dateTo)).map(payout => {
    const order = ordersById.get(payout.orderId);
    return [excelDate(payout.paymentDate), 'Выплата водителю', payout.driverName, order?.client ?? '', order?.number ?? '', payout.amount,
      formatB2BPaymentMethod(payout.method), payout.paymentOrderNumber ?? '', payout.comment, payout.id, payout.orderId, payout.assignmentId];
  });
  const otherExpenseRows: ExportValue[][] = data.expenses
    .filter(expense => expense.source !== 'driver_payment' && inPeriod(expense.expenseDate, dateFrom, dateTo))
    .map(expense => {
      const order = ordersByNumber.get(expense.orderNumber);
      return [excelDate(expense.expenseDate), expense.category === 'taxes' ? 'Налог' : 'Расход', expense.purpose, order?.client ?? '', expense.orderNumber,
        expense.amount, formatB2BPaymentMethod(expense.method), expense.paymentOrderNumber ?? '', expense.comment, expense.id, order?.id ?? '', expense.sourceId ?? ''];
    });
  const expenseRows = [...payoutRows, ...otherExpenseRows].sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  return [
    { name: 'Поступления', columns: incomeColumns, rows: incomeRows },
    { name: 'Выплаты', columns: expenseColumns, rows: expenseRows },
  ];
}

export function buildB2BExportSheets(tab: B2BExportTab, data: B2BExportData, dateFrom: string, dateTo: string): B2BExportSheet[] {
  if (tab === 'cashier' || tab === 'cashflow') return buildCashflowSheets(data, dateFrom, dateTo);
  const periodOrders = orderRowsForPeriod(data, dateFrom, dateTo);
  if (tab === 'orders') return [{ name: 'Заказы', columns: orderColumns, rows: buildOrderRows(data, dateFrom, dateTo) }];
  if (tab === 'calendar') return [{ name: 'Календарь', columns: orderColumns, rows: buildOrderRows(data, dateFrom, dateTo) }];
  if (tab === 'logistics') {
    const columns: ExportColumn[] = [
      { header: 'Дата выезда', width: 15, kind: 'date' }, { header: 'Заказ', width: 18 }, { header: 'Клиент', width: 28 },
      { header: 'Маршрут', width: 42 }, { header: 'Транспорт', width: 18 }, { header: 'Количество', width: 12 },
      { header: 'Водитель', width: 26 }, { header: 'Начислено', width: 16, kind: 'money' }, { header: 'Выплачено', width: 16, kind: 'money' },
      { header: 'Остаток', width: 16, kind: 'money' }, { header: 'Статус', width: 20 }, { header: 'ID заказа', width: 38, kind: 'id' },
      { header: 'ID назначения', width: 38, kind: 'id' }, { header: 'ID водителя', width: 38, kind: 'id' },
    ];
    const rows = periodOrders.map(order => {
      const accrued = order.driverTotal ?? (order.driverPricePerUnit ?? 0) * order.transportCount;
      const paid = data.payouts.filter(payout => payout.assignmentId === order.assignmentId).reduce((sum, payout) => sum + payout.amount, 0);
      return [excelDate(order.departureDate), order.number, order.client, `${order.routeFrom} → ${order.routeTo}`, order.transport, order.transportCount,
        order.driverName, accrued, paid, accrued - paid, STATUS_LABELS[order.status] ?? order.status, order.id, order.assignmentId ?? '', order.driverId ?? ''];
    });
    return [{ name: 'Логистика', columns, rows }];
  }
  if (tab === 'clients') {
    const columns: ExportColumn[] = [
      { header: 'Тип клиента', width: 18 }, { header: 'Компания', width: 30 }, { header: 'Полное наименование', width: 36 },
      { header: 'Контактное лицо', width: 28 }, { header: 'Телефон', width: 18 }, { header: 'Доп. телефон', width: 18 }, { header: 'Email', width: 28 },
      { header: 'ИНН', width: 18 }, { header: 'ОКПО', width: 18 }, { header: 'Юридический адрес', width: 38 }, { header: 'Банк', width: 28 },
      { header: 'БИК', width: 18 }, { header: 'Расчётный счёт', width: 24 }, { header: 'Должность подписанта', width: 25 },
      { header: 'ФИО подписанта', width: 28 }, { header: 'Комментарий', width: 38 }, { header: 'Заказов за период', width: 18 },
      { header: 'Оборот за период', width: 18, kind: 'money' }, { header: 'Поступило за период', width: 20, kind: 'money' },
      { header: 'ID клиента', width: 38, kind: 'id' },
    ];
    const periodOrderIds = new Set(periodOrders.map(order => order.id));
    const rows = data.clients.map(client => {
      const clientOrders = periodOrders.filter(order => order.clientId === client.id);
      const received = data.payments.filter(payment => periodOrderIds.has(payment.orderId) && payment.status === 'confirmed' && clientOrders.some(order => order.id === payment.orderId)).reduce((sum, payment) => sum + payment.amount, 0);
      return [CLIENT_TYPE_LABELS[client.clientType] ?? client.clientType, client.companyName, client.orgName, client.contactName, client.phone1, client.phone2,
        client.email, client.inn, client.okpo, client.legalAddress, client.bankName, client.bik, client.bankAccount, client.signerPosition,
        client.signerName, client.comments, clientOrders.length, clientOrders.reduce((sum, order) => sum + order.total, 0), received, client.id];
    });
    return [{ name: 'Клиенты', columns, rows }];
  }
  if (tab === 'expenses') {
    const columns: ExportColumn[] = [
      { header: 'Дата', width: 15, kind: 'date' }, { header: 'Заказ', width: 18 }, { header: 'Категория', width: 20 },
      { header: 'Назначение', width: 34 }, { header: 'Способ оплаты', width: 27 }, { header: 'Платёжное поручение', width: 22 },
      { header: 'Сумма', width: 16, kind: 'money' }, { header: 'Комментарий', width: 38 }, { header: 'Источник', width: 20 },
      { header: 'ID расхода', width: 38, kind: 'id' }, { header: 'ID источника', width: 38, kind: 'id' },
    ];
    const rows = data.expenses.filter(expense => inPeriod(expense.expenseDate, dateFrom, dateTo)).map(expense => [
      excelDate(expense.expenseDate), expense.orderNumber, expense.category, expense.purpose, formatB2BPaymentMethod(expense.method),
      expense.paymentOrderNumber ?? '', expense.amount, expense.comment, expense.source, expense.id, expense.sourceId ?? '',
    ]);
    return [{ name: 'Расходы', columns, rows }];
  }
  const columns: ExportColumn[] = [
    { header: 'Дата выезда', width: 15, kind: 'date' }, { header: 'Заказ', width: 18 }, { header: 'Клиент', width: 28 },
    { header: 'Продано', width: 16, kind: 'money' }, { header: 'Поступило', width: 16, kind: 'money' },
    { header: 'Водитель', width: 16, kind: 'money' }, { header: 'Налог 4%', width: 16, kind: 'money' },
    { header: 'Прочие расходы', width: 18, kind: 'money' }, { header: 'Остаток', width: 16, kind: 'money' },
    { header: 'Нам должны', width: 16, kind: 'money' }, { header: 'Мы должны', width: 16, kind: 'money' },
    { header: 'Маржа', width: 13, kind: 'percent' }, { header: 'ID заказа', width: 38, kind: 'id' },
  ];
  const rows = periodOrders.map(order => {
    const profit = calculateB2BOrderProfit(order, data.payments, data.payouts, data.expenses);
    return [excelDate(orderDate(order)), order.number, order.client, profit.sold, profit.received, profit.driverCost, profit.taxCost,
      profit.otherCost, profit.balance, profit.receivable, profit.payable, profit.margin / 100, order.id];
  });
  return [{ name: 'P&L', columns, rows }];
}

export function getB2BExportRowCount(tab: B2BExportTab, data: B2BExportData, dateFrom: string, dateTo: string): number {
  return buildB2BExportSheets(tab, data, dateFrom, dateTo).reduce((sum, sheet) => sum + sheet.rows.length, 0);
}

export async function downloadB2BExcel(tab: B2BExportTab, label: string, data: B2BExportData, dateFrom: string, dateTo: string): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OutWay CRM';
  workbook.created = new Date();
  const sheets = buildB2BExportSheets(tab, data, dateFrom, dateTo);
  const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });
  const thin = { style: 'thin' as const, color: { argb: 'FFD7E4E6' } };

  sheets.forEach(sheet => {
    const worksheet = workbook.addWorksheet(sheet.name, { views: [{ state: 'frozen', ySplit: 5, showGridLines: false }] });
    worksheet.columns = sheet.columns.map(column => ({ width: column.width }));
    worksheet.mergeCells(1, 1, 1, sheet.columns.length);
    worksheet.getCell(1, 1).value = `OutWay B2B · ${label} · ${sheet.name}`;
    worksheet.getCell(1, 1).font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getCell(1, 1).fill = fill('FF31A4A5');
    worksheet.getCell(1, 1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    worksheet.getRow(1).height = 30;
    worksheet.mergeCells(2, 1, 2, sheet.columns.length);
    worksheet.getCell(2, 1).value = `Период: ${dateFrom.split('-').reverse().join('.')} — ${dateTo.split('-').reverse().join('.')} · строк: ${sheet.rows.length}`;
    worksheet.getCell(2, 1).font = { bold: true, color: { argb: 'FF287F82' } };
    worksheet.mergeCells(3, 1, 3, sheet.columns.length);
    worksheet.getCell(3, 1).value = 'Можно исправлять даты, суммы и описания. Колонки ID не изменяйте — по ним данные обновляются в CRM.';
    worksheet.getCell(3, 1).font = { italic: true, color: { argb: 'FF64748B' } };
    const headerRow = worksheet.getRow(5);
    sheet.columns.forEach((column, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = column.header;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = fill(column.kind === 'id' ? 'FF64748B' : 'FF287F82');
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
    });
    headerRow.height = 30;
    sheet.rows.forEach((values, rowIndex) => {
      const row = worksheet.addRow(values);
      row.height = 22;
      values.forEach((_value, columnIndex) => {
        const cell = row.getCell(columnIndex + 1);
        const column = sheet.columns[columnIndex];
        cell.font = { name: 'Calibri', size: 10, color: { argb: column.kind === 'id' ? 'FF64748B' : 'FF17222F' } };
        cell.alignment = { vertical: 'middle', horizontal: column.kind === 'money' || column.kind === 'percent' ? 'right' : 'left', wrapText: true };
        cell.border = { top: thin, left: thin, bottom: thin, right: thin };
        if (rowIndex % 2 === 1) cell.fill = fill('FFF3FAF9');
        if (column.kind === 'date' && cell.value instanceof Date) cell.numFmt = 'dd.mm.yyyy';
        if (column.kind === 'money') cell.numFmt = '#,##0.00';
        if (column.kind === 'percent') cell.numFmt = '0.0%';
        if (column.kind === 'id') cell.fill = fill(rowIndex % 2 === 1 ? 'FFF0F3F5' : 'FFF7F9FA');
        if (column.header === 'Платёжное поручение' && !cell.value) cell.fill = fill('FFFFF4D8');
      });
    });
    worksheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + Math.max(sheet.rows.length, 1), column: sheet.columns.length } };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `OutWay_B2B_${label.replace(/[^\p{L}\p{N}]+/gu, '_')}_${dateFrom}_${dateTo}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
