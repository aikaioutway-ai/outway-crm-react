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

export function formatClassName(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const match = String(value).match(/\d+/);
  return match ? match[0] : '';
}
