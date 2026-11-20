import {
  buildDriverCheckUrl,
  buildDriverInviteWhatsAppText,
  buildDriverWhatsAppText,
  buildWhatsAppShareUrl,
  extractDriverCheckToken,
  formatRuDate,
  normalizeWhatsAppPhone,
  roundOfIsoDate,
} from './driverCheckService';

describe('driverCheckService helpers', () => {
  const token = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

  test('roundOfIsoDate splits a month into 4 check rounds', () => {
    expect(roundOfIsoDate('2026-11-01')).toBe(1);
    expect(roundOfIsoDate('2026-11-07')).toBe(1);
    expect(roundOfIsoDate('2026-11-08')).toBe(2);
    expect(roundOfIsoDate('2026-11-14')).toBe(2);
    expect(roundOfIsoDate('2026-11-15')).toBe(3);
    expect(roundOfIsoDate('2026-11-21')).toBe(3);
    expect(roundOfIsoDate('2026-11-22')).toBe(4);
    expect(roundOfIsoDate('2026-11-30')).toBe(4);
  });

  test('extractDriverCheckToken reads /driver/<token> and ?driver=<token>', () => {
    expect(extractDriverCheckToken({ pathname: `/driver/${token}`, search: '' })).toBe(token);
    expect(extractDriverCheckToken({ pathname: '/', search: `?driver=${token.toUpperCase()}` })).toBe(token);
    expect(extractDriverCheckToken({ pathname: '/driver/short', search: '' })).toBeNull();
    expect(extractDriverCheckToken({ pathname: '/', search: '' })).toBeNull();
  });

  test('buildDriverCheckUrl formats clean permanent link', () => {
    expect(buildDriverCheckUrl(token)).toBe(`https://outway-crm-react.vercel.app/driver/${token}`);
    expect(buildDriverCheckUrl(token, 'https://crm.outway.kg/')).toBe(`https://crm.outway.kg/driver/${token}`);
  });

  test('formatRuDate converts ISO date to DD.MM.YYYY', () => {
    expect(formatRuDate('2026-11-20')).toBe('20.11.2026');
  });

  test('normalizeWhatsAppPhone converts Kyrgyz local numbers', () => {
    expect(normalizeWhatsAppPhone('0555 12-34-56')).toBe('996555123456');
    expect(normalizeWhatsAppPhone('+996 700 11 22 33')).toBe('996700112233');
    expect(normalizeWhatsAppPhone('555123456')).toBe('996555123456');
    expect(normalizeWhatsAppPhone('')).toBe('');
  });

  test('buildDriverWhatsAppText lists checked and unchecked children with round and totals', () => {
    const text = buildDriverWhatsAppText({
      date: '2026-11-20',
      transfer: { id: 't1', transferNumber: 3, schoolLabel: 'TIS', driverName: 'Азамат' },
      children: [
        { id: 'c1', childName: 'Алия Ахметова', address: 'ул. Чуй 10', stopOrder: 1, present: true, markedAt: null },
        { id: 'c2', childName: 'Тимур Исаев', address: 'мкр. Джал 15', stopOrder: 2, present: false, markedAt: null },
      ],
    });
    expect(text).toContain('🚌 TIS · Трансфер №3 (20.11.2026 · Сверка 3)');
    expect(text).toContain('✅ Есть (1):');
    expect(text).toContain('1. Алия Ахметова');
    expect(text).toContain('❌ Нет (1):');
    expect(text).toContain('1. Тимур Исаев (мкр. Джал 15)');
    expect(text).toContain('Итого: 1 из 2');
  });

  test('buildWhatsAppShareUrl opens group picker without phone and direct chat with phone', () => {
    expect(buildWhatsAppShareUrl('Привет')).toBe('https://wa.me/?text=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82');
    expect(buildWhatsAppShareUrl('Привет', '0555112233')).toBe('https://wa.me/996555112233?text=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82');
  });

  test('buildDriverInviteWhatsAppText includes transfer title and link', () => {
    const text = buildDriverInviteWhatsAppText(
      { schoolLabel: 'ERU', transferNumber: 2, driverLinkToken: token },
      'https://crm.outway.kg',
    );
    expect(text).toContain('ERU, Трансфер №2');
    expect(text).toContain(`https://crm.outway.kg/driver/${token}`);
  });
});
