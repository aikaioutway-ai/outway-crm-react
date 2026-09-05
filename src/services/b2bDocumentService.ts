import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

export interface B2BDocumentOrder {
  number: string;
  client: string;
  routeFrom: string;
  routeTo: string;
  requestDate: string;
  departureDate: string;
  transport: string;
  transportCount: number;
  pricePerUnit: number;
  total: number;
}

export type B2BGeneratedDocumentType = 'invoice' | 'act';

export interface B2BReconciliationTransaction {
  date: string;
  document: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface B2BReconciliationDocument {
  clientName: string;
  clientInn?: string;
  clientAddress?: string;
  dateFrom: string;
  dateTo: string;
  openingBalance: number;
  debitTotal: number;
  creditTotal: number;
  closingBalance: number;
  transactions: B2BReconciliationTransaction[];
}

const COMPANY = {
  name: 'ОсОО «АйКай Груп»',
  inn: '03010202310037',
  okpo: '32308001',
  address: 'г. Бишкек, ул. Аалы Токомбаева, 21/2',
  bank: 'ФИЛИАЛ «МЕДАКАДЕМИЯ» ОАО «МБАНК»',
  bik: '103038',
  account: '1033820000256673',
  signer: 'Мамазаирова А.Э.',
};

const money = (value: number) => `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} сом`;

function documentDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU');
}

export function generatedDocumentNumber(type: B2BGeneratedDocumentType, orderNumber: string) {
  return `${type === 'invoice' ? 'СЧ' : 'АКТ'}-${orderNumber}`;
}

export function buildB2BDocumentDefinition(type: B2BGeneratedDocumentType, order: B2BDocumentOrder): TDocumentDefinitions {
  const isInvoice = type === 'invoice';
  const number = generatedDocumentNumber(type, order.number);
  const title = isInvoice ? 'СЧЁТ НА ОПЛАТУ' : 'АКТ ВЫПОЛНЕННЫХ УСЛУГ';
  const service = `Транспортные услуги: ${order.routeFrom} - ${order.routeTo}; ${order.transport}; выезд ${order.departureDate || 'по согласованию'}`;
  const content: Content[] = [
    {
      table: {
        widths: ['*', 110, 105],
        body: [[
          { text: title, bold: true, fontSize: 17, color: '#FFFFFF', margin: [10, 10, 6, 10] },
          { text: `№ ${number}`, bold: true, fontSize: 12, color: '#FFFFFF', alignment: 'center', margin: [4, 12, 4, 10] },
          { text: `от ${documentDate(order.requestDate)}`, fontSize: 9, color: '#D0E4F5', alignment: 'right', margin: [4, 13, 8, 10] },
        ]],
      },
      layout: { fillColor: () => '#1A3A5C', hLineWidth: () => 0, vLineWidth: () => 0 },
    },
    { text: isInvoice ? 'Оплата транспортных услуг' : 'По договору оказания транспортных услуг', color: '#2E5F8A', italics: true, alignment: 'center', margin: [0, 10, 0, 14] },
    {
      columns: [
        { width: '*', stack: [{ text: 'ИСПОЛНИТЕЛЬ', style: 'caption' }, { text: COMPANY.name, bold: true }, { text: `ИНН ${COMPANY.inn} · ОКПО ${COMPANY.okpo}`, style: 'small' }, { text: COMPANY.address, style: 'small' }] },
        { width: '*', stack: [{ text: 'ЗАКАЗЧИК', style: 'caption' }, { text: order.client, bold: true }, { text: `Заказ ${order.number}`, style: 'small' }, { text: `${order.routeFrom} - ${order.routeTo}`, style: 'small' }] },
      ],
      columnGap: 18,
      margin: [0, 0, 0, 16],
    },
    {
      table: {
        headerRows: 1,
        widths: [22, '*', 52, 72, 78],
        body: [
          [
            { text: '№', style: 'tableHead' }, { text: isInvoice ? 'Наименование услуги' : 'Описание услуги', style: 'tableHead' },
            { text: 'Кол-во', style: 'tableHead', alignment: 'right' }, { text: 'Цена, сом', style: 'tableHead', alignment: 'right' }, { text: 'Сумма, сом', style: 'tableHead', alignment: 'right' },
          ],
          ['1', service, { text: String(order.transportCount), alignment: 'right' }, { text: money(order.pricePerUnit), alignment: 'right' }, { text: money(order.total), alignment: 'right' }],
          ['', 'НДС', '', { text: 'не облагается', color: '#777777', alignment: 'right' }, { text: '0,00 сом', alignment: 'right' }],
          ['', { text: isInvoice ? 'ИТОГО К ОПЛАТЕ:' : 'ИТОГО ВЫПОЛНЕНО:', bold: true, color: '#FFFFFF', alignment: 'right', colSpan: 3 }, {}, {}, { text: money(order.total), bold: true, color: '#FFFFFF', alignment: 'right' }],
        ],
      },
      layout: {
        fillColor: row => row === 0 || row === 3 ? '#1A3A5C' : row === 2 ? '#F4F6F7' : '#FFFFFF',
        hLineColor: () => '#DDE5E8', vLineColor: () => '#DDE5E8',
      },
    },
    { text: `${isInvoice ? 'Итого к оплате' : 'Итого выполнено работ'}: ${money(order.total)}`, bold: true, fontSize: 14, color: '#1A3A5C', alignment: 'right', margin: [0, 14, 0, 8] },
    { text: isInvoice ? 'Срок оплаты: в течение 5 рабочих дней с момента выставления счёта.' : 'Претензии по объёму и качеству оказанных услуг: отсутствуют.', italics: true, color: '#555555', fontSize: 9, margin: [0, 0, 0, 28] },
    {
      columns: [
        { width: '*', stack: [{ text: isInvoice ? 'Выставил:' : 'ИСПОЛНИТЕЛЬ', style: 'caption' }, { text: `Генеральный директор  __________  ${COMPANY.signer}`, margin: [0, 20, 0, 0] }] },
        { width: '*', stack: [{ text: isInvoice ? 'Принял:' : 'ЗАКАЗЧИК', style: 'caption' }, { text: '________________  __________  __________________', margin: [0, 20, 0, 0] }] },
      ],
      columnGap: 24,
    },
    { text: `Банк: ${COMPANY.bank} · БИК ${COMPANY.bik} · Р/с ${COMPANY.account}`, fontSize: 7.5, color: '#7A859D', alignment: 'center', margin: [0, 42, 0, 0] },
  ];

  return {
    pageSize: 'A4', pageMargins: [42, 42, 42, 38], content,
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#1A1A1A', lineHeight: 1.25 },
    styles: {
      caption: { bold: true, fontSize: 8, color: '#2E5F8A', characterSpacing: 0.6 },
      small: { fontSize: 8, color: '#5E6872', margin: [0, 3, 0, 0] },
      tableHead: { bold: true, fontSize: 8, color: '#FFFFFF', margin: [2, 4, 2, 4] },
    },
    info: { title: `${title} ${number}`, author: COMPANY.name, subject: `Заказ ${order.number}` },
  };
}

export async function downloadB2BGeneratedDocument(type: B2BGeneratedDocumentType, order: B2BDocumentOrder) {
  const number = generatedDocumentNumber(type, order.number);
  const [{ default: pdfMake }, { default: pdfFonts }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  pdfMake.addVirtualFileSystem(pdfFonts);
  const blob = await pdfMake.createPdf(buildB2BDocumentDefinition(type, order)).getBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${number}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildB2BReconciliationDefinition(data: B2BReconciliationDocument): TDocumentDefinitions {
  const debtText = data.closingBalance > 0
    ? `Задолженность заказчика в пользу ${COMPANY.name}: ${money(data.closingBalance)}`
    : data.closingBalance < 0
      ? `Переплата заказчика: ${money(Math.abs(data.closingBalance))}`
      : 'Задолженность между сторонами отсутствует.';
  const body: any[][] = [[
    { text: 'Дата', style: 'tableHead' },
    { text: 'Документ', style: 'tableHead' },
    { text: 'Содержание операции', style: 'tableHead' },
    { text: 'Начислено', style: 'tableHead', alignment: 'right' },
    { text: 'Оплачено', style: 'tableHead', alignment: 'right' },
    { text: 'Сальдо', style: 'tableHead', alignment: 'right' },
  ]];
  body.push([
    '', '', { text: 'Сальдо на начало периода', bold: true }, '', '',
    { text: money(data.openingBalance), bold: true, alignment: 'right' },
  ]);
  data.transactions.forEach(transaction => body.push([
    documentDate(transaction.date), transaction.document, transaction.description,
    { text: transaction.debit ? money(transaction.debit) : '—', alignment: 'right' },
    { text: transaction.credit ? money(transaction.credit) : '—', alignment: 'right' },
    { text: money(transaction.balance), alignment: 'right' },
  ]));
  body.push([
    '', '', { text: 'ИТОГО ЗА ПЕРИОД:', bold: true, color: '#FFFFFF', alignment: 'right' },
    { text: money(data.debitTotal), bold: true, color: '#FFFFFF', alignment: 'right' },
    { text: money(data.creditTotal), bold: true, color: '#FFFFFF', alignment: 'right' },
    { text: money(data.closingBalance), bold: true, color: '#FFFFFF', alignment: 'right' },
  ]);

  return {
    pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [34, 34, 34, 32],
    content: [
      {
        table: { widths: ['*', 180], body: [[
          { text: 'АКТ СВЕРКИ ВЗАИМНЫХ РАСЧЁТОВ', bold: true, fontSize: 16, color: '#FFFFFF', margin: [10, 10, 6, 10] },
          { text: `за ${documentDate(data.dateFrom)} — ${documentDate(data.dateTo)}`, fontSize: 9, color: '#D0E4F5', alignment: 'right', margin: [4, 13, 8, 10] },
        ]] },
        layout: { fillColor: () => '#1A3A5C', hLineWidth: () => 0, vLineWidth: () => 0 },
      },
      { text: 'По данным бухгалтерского учёта сторон', color: '#2E5F8A', italics: true, alignment: 'center', margin: [0, 9, 0, 13] },
      {
        columns: [
          { width: '*', stack: [{ text: 'ИСПОЛНИТЕЛЬ', style: 'caption' }, { text: COMPANY.name, bold: true }, { text: `ИНН ${COMPANY.inn} · ОКПО ${COMPANY.okpo}`, style: 'small' }, { text: COMPANY.address, style: 'small' }] },
          { width: '*', stack: [{ text: 'ЗАКАЗЧИК', style: 'caption' }, { text: data.clientName, bold: true }, { text: data.clientInn ? `ИНН ${data.clientInn}` : 'ИНН не указан', style: 'small' }, { text: data.clientAddress || 'Адрес не указан', style: 'small' }] },
        ], columnGap: 22, margin: [0, 0, 0, 13],
      },
      {
        table: { headerRows: 1, widths: [55, 92, '*', 72, 72, 76], body },
        layout: {
          fillColor: row => row === 0 || row === body.length - 1 ? '#1A3A5C' : row % 2 === 0 ? '#F5F8F9' : '#FFFFFF',
          hLineColor: () => '#DDE5E8', vLineColor: () => '#DDE5E8',
        },
      },
      { text: debtText, bold: true, fontSize: 12, color: data.closingBalance > 0 ? '#A04D42' : '#1A3A5C', alignment: 'right', margin: [0, 13, 0, 24] },
      {
        columns: [
          { width: '*', stack: [{ text: 'ИСПОЛНИТЕЛЬ', style: 'caption' }, { text: `Генеральный директор  __________  ${COMPANY.signer}`, margin: [0, 18, 0, 0] }] },
          { width: '*', stack: [{ text: 'ЗАКАЗЧИК', style: 'caption' }, { text: '________________  __________  __________________', margin: [0, 18, 0, 0] }] },
        ], columnGap: 28,
      },
    ],
    defaultStyle: { font: 'Roboto', fontSize: 8, color: '#1A1A1A', lineHeight: 1.2 },
    styles: {
      caption: { bold: true, fontSize: 8, color: '#2E5F8A', characterSpacing: 0.6 },
      small: { fontSize: 8, color: '#5E6872', margin: [0, 3, 0, 0] },
      tableHead: { bold: true, fontSize: 7.5, color: '#FFFFFF', margin: [2, 4, 2, 4] },
    },
    info: { title: `Акт сверки ${data.clientName} ${data.dateFrom}–${data.dateTo}`, author: COMPANY.name },
  };
}

export async function downloadB2BReconciliation(data: B2BReconciliationDocument) {
  const [{ default: pdfMake }, { default: pdfFonts }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  pdfMake.addVirtualFileSystem(pdfFonts);
  const blob = await pdfMake.createPdf(buildB2BReconciliationDefinition(data)).getBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Акт-сверки-${data.clientName.replace(/[^\p{L}\p{N}-]+/gu, '-')}-${data.dateFrom}-${data.dateTo}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
