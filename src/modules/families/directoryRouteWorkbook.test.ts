import ExcelJS from 'exceljs';
import { buildDirectoryRouteWorkbook } from './directoryRouteWorkbook';

describe('buildDirectoryRouteWorkbook', () => {
  it('creates the manager route sheet in the reference layout', async () => {
    const workbook = buildDirectoryRouteWorkbook([{
      meta: {
        school: 'ERU',
        transfer: '№6',
        driver: 'Байботоев Самат',
        contacts: '0708924433 / 0773050724',
        vehicle: 'Минивэн / 08KG577AUF',
      },
      rows: [{
        childName: 'Второй ребёнок',
        streetAddress: 'Адрес 2',
        phone: '+996 555 00 00 02',
        secondPhone: '',
        contactPhone: '',
        stopNumber: '2',
        status: 'active',
      },
      {
        childName: 'Первый ребёнок',
        streetAddress: 'Адрес 1',
        phone: '+996 555 00 00 01',
        secondPhone: '+996 700 00 00 01',
        contactPhone: '+996 555 00 00 01',
        stopNumber: '1',
        status: 'active',
      },
      {
        childName: 'Отказ',
        streetAddress: 'Не выгружается',
        phone: '',
        secondPhone: '',
        contactPhone: '',
        stopNumber: '3',
        status: 'rejected',
      }],
    }]);

    const sheet = workbook.getWorksheet('Маршрут');
    expect(sheet).toBeDefined();
    expect(sheet!.getCell('A1').value).toBe('OutWay  ·  Маршрутный лист');
    expect(sheet!.getCell('A2').value).toBe('Школа');
    expect(sheet!.getCell('B2').value).toBe('ERU');
    expect(sheet!.getCell('C4').value).toBe('Авто');
    expect(sheet!.getCell('D4').value).toBe('Минивэн / 08KG577AUF');
    expect(sheet!.getCell('A6').value).toBe('№ остановки');
    expect(sheet!.getCell('B8').value).toBe('Первый ребёнок');
    expect(sheet!.getCell('D8').value).toBe('+996 555 00 00 01 / +996 700 00 00 01');
    expect(sheet!.getCell('B9').value).toBe('Второй ребёнок');
    expect(sheet!.getCell('B10').value).toBeNull();
    expect(sheet!.getCell('A11').value).toBe('Подпись водителя: _______________________');
    expect(sheet!.pageSetup.printArea).toBe('A1:D11');
    expect(sheet!.views[0]).toMatchObject({ state: 'frozen', ySplit: 7, showGridLines: false });

    const exported = await workbook.xlsx.writeBuffer();
    const reopened = await new ExcelJS.Workbook().xlsx.load(exported);
    expect(reopened.getWorksheet('Маршрут')!.getCell('D4').value).toBe('Минивэн / 08KG577AUF');
    expect(reopened.getWorksheet('Маршрут')!.pageSetup.printArea).toBe('A1:D11');
  });

  it('renders every transfer as a separate table below the previous one', () => {
    const row = (childName: string, stopNumber: string) => ({
      childName,
      streetAddress: `Адрес ${stopNumber}`,
      phone: `+996 555 00 00 0${stopNumber}`,
      secondPhone: '',
      contactPhone: '',
      stopNumber,
      status: 'active',
    });
    const workbook = buildDirectoryRouteWorkbook([
      {
        meta: { school: 'GEN #2', transfer: '№1', driver: 'Водитель 1', contacts: '111', vehicle: 'Минивэн 1' },
        rows: [row('Ребёнок 2', '2'), row('Ребёнок 1', '1')],
      },
      {
        meta: { school: 'GEN #2', transfer: '№2', driver: 'Водитель 2', contacts: '222', vehicle: 'Минивэн 2' },
        rows: [row('Ребёнок 3', '1')],
      },
    ]);

    const sheet = workbook.getWorksheet('Маршрут')!;
    expect(sheet.getCell('D2').value).toBe('№1');
    expect(sheet.getCell('B8').value).toBe('Ребёнок 1');
    expect(sheet.getCell('A11').value).toBe('Подпись водителя: _______________________');
    expect(sheet.getCell('A13').value).toBe('OutWay  ·  Маршрутный лист');
    expect(sheet.getCell('D14').value).toBe('№2');
    expect(sheet.getCell('B15').value).toBe('Водитель 2');
    expect(sheet.getCell('B20').value).toBe('Ребёнок 3');
    expect(sheet.getCell('A22').value).toBe('Подпись водителя: _______________________');
    expect(sheet.pageSetup.printArea).toBe('A1:D22');
    expect(sheet.views[0]).toEqual({ showGridLines: false });
  });
});
