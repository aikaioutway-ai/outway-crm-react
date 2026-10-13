// Форматирование имён и телефонов

/**
 * Фамилия Имя — берём первые 2 слова, с заглавной буквы
 * "Нармаматов Темирлан Бекназар" → "Нармаматов Темирлан"
 */
export function formatName(name: string | null | undefined): string {
  if (!name) return '';
  const words = name.trim().split(/\s+/).slice(0, 2);
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Форматирует телефон в +996555121314 без пробелов
 * Если начинается с другого кода страны — оставляет как есть
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');

  // Кыргызстан: 996 + 9 цифр = 12 цифр итого
  if (digits.startsWith('996') && digits.length === 12) {
    return `+${digits}`;
  }
  // Локальный номер без кода (0xxx): добавляем +996
  if (digits.startsWith('0') && digits.length === 10) {
    return `+996${digits.slice(1)}`;
  }
  // Просто 9 цифр без нуля
  if (digits.length === 9 && !digits.startsWith('0')) {
    return `+996${digits}`;
  }
  // Другая страна или непонятный формат — оставляем
  return phone.trim();
}

/**
 * Ссылка на чат в WhatsApp по номеру телефона.
 * Возвращает null, если цифр слишком мало для реального номера.
 */
export function whatsAppLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 9) return null;
  return `https://wa.me/${digits}`;
}

export function formatClassName(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const match = String(value).match(/\d+/);
  return match ? match[0] : '';
}

/**
 * Значимые цифры номера для поиска — без +996, 996 и ведущего 0.
 * В базе один и тот же номер записан как 0555…, 996555…, +996555… или 555…,
 * поэтому поиск сравнивает только эту часть.
 */
export function phoneSearchDigits(value: string | null | undefined): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('996')) return digits.slice(3);
  if (digits.startsWith('0')) return digits.slice(1);
  return digits;
}

/** Цифры для поиска, если запрос похож на телефон (только цифры, пробелы, +, -, скобки), иначе null. */
export function phoneQueryDigits(query: string | null | undefined): string | null {
  const trimmed = String(query ?? '').trim();
  if (!/^[\d\s+()-]+$/.test(trimmed)) return null;
  const digits = phoneSearchDigits(trimmed);
  return digits.length >= 3 ? digits : null;
}

/** Совпадает ли хотя бы один из телефонов с запросом независимо от формата записи. */
export function phoneMatchesQuery(query: string | null | undefined, ...phones: Array<string | null | undefined>): boolean {
  const digits = phoneQueryDigits(query);
  return !!digits && phones.some(phone => phoneSearchDigits(phone).includes(digits));
}
