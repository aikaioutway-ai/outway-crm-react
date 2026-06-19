import { parseBankCsv } from '../services/bankStatementService';

describe('parseBankCsv', () => {
  test('парсит стандартный CSV с запятой', () => {
    const csv = `id,сумма,дата
29e98b10-a039-4186-8084-15f97c646360,5500,10.06.2026
abc123,6000,11.06.2026`;

    const rows = parseBankCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].receipt_code).toBe('29e98b10-a039-4186-8084-15f97c646360');
    expect(rows[0].amount).toBe(5500);
    expect(rows[0].statement_date).toBe('2026-06-10');
  });

  test('парсит TSV с табуляцией', () => {
    const tsv = `transaction id\tamount\tdate\nabc-123\t5000\t2026-06-15`;
    const rows = parseBankCsv(tsv);
    expect(rows).toHaveLength(1);
    expect(rows[0].receipt_code).toBe('abc-123');
    expect(rows[0].amount).toBe(5000);
    expect(rows[0].statement_date).toBe('2026-06-15');
  });

  test('пропускает строки с невалидными данными', () => {
    const csv = `id,сумма,дата
good-id,5500,10.06.2026
,abc,bad-date
another-id,6000,2026-06-11`;

    const rows = parseBankCsv(csv);
    expect(rows).toHaveLength(2);
  });

  test('нормализует дату DD.MM.YYYY в YYYY-MM-DD', () => {
    const csv = `id,сумма,дата\nxxx,5000,19.06.2026`;
    const rows = parseBankCsv(csv);
    expect(rows[0].statement_date).toBe('2026-06-19');
  });

  test('принимает дату уже в формате YYYY-MM-DD', () => {
    const csv = `id,сумма,дата\nxxx,5000,2026-06-19`;
    const rows = parseBankCsv(csv);
    expect(rows[0].statement_date).toBe('2026-06-19');
  });

  test('парсит сумму с пробелами и запятой', () => {
    const csv = `id,сумма,дата\nxxx,"5 500,00",10.06.2026`;
    const rows = parseBankCsv(csv);
    expect(rows[0].amount).toBe(5500);
  });

  test('бросает ошибку если нет нужных колонок', () => {
    const csv = `name,price,when\nfoo,100,today`;
    expect(() => parseBankCsv(csv)).toThrow('Не найдены колонки');
  });

  test('возвращает пустой массив если только заголовок', () => {
    const csv = `id,сумма,дата`;
    const rows = parseBankCsv(csv);
    expect(rows).toHaveLength(0);
  });

  test('убирает кавычки вокруг значений', () => {
    const csv = `id,сумма,дата\n"29e98b10-abc","5500","10.06.2026"`;
    const rows = parseBankCsv(csv);
    expect(rows[0].receipt_code).toBe('29e98b10-abc');
    expect(rows[0].amount).toBe(5500);
  });
});
