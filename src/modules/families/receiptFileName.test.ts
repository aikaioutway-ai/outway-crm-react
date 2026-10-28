import { familySurname, receiptDownloadName } from './receiptFileName';

describe('familySurname', () => {
  it('turns male and female surnames into the family plural', () => {
    expect(familySurname('Казыбаев Алихан')).toBe('Казыбаевы');
    expect(familySurname('Тенишева Айлин')).toBe('Тенишевы');
    expect(familySurname('абдиллова раяна')).toBe('Абдилловы');
  });
  it('keeps surnames without a Russian ending', () => {
    expect(familySurname('Пак Виктория')).toBe('Пак');
    expect(familySurname('Ашим уулу Самарбек')).toBe('Ашим уулу');
  });
});

describe('receiptDownloadName', () => {
  it('names the file by family and amount', () => {
    expect(receiptDownloadName({ childNames: ['Бекбосунов Даниэль', 'Бекбосунова Жасмин'], amount: 6400, originalName: '1790-P09.pdf' })).toBe('Бекбосуновы — 6400 сом.pdf');
  });
  it('lists different surnames in one family', () => {
    expect(receiptDownloadName({ childNames: ['Бекбосунов Даниэль', 'Саламатова Анэли'], amount: 100, originalName: 'a.jpg' })).toBe('Бекбосуновы, Саламатовы — 100 сом.jpg');
  });
  it('falls back to parent name, then to the original file name', () => {
    expect(receiptDownloadName({ childNames: [], parentName: 'Пак Виктория', amount: 500, originalName: 'a.png' })).toBe('Пак Виктория — 500 сом.png');
    expect(receiptDownloadName({ childNames: [], originalName: 'a.png' })).toBe('a.png');
  });
});
