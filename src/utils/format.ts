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
 * Форматирует телефон в +996 XXX XXX XXX
 * Если начинается с другого кода страны — оставляет как есть
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');

  // Кыргызстан: 996 + 9 цифр = 12 цифр итого
  if (digits.startsWith('996') && digits.length === 12) {
    const n = digits.slice(3); // 9 цифр номера
    return `+996 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  // Локальный номер без кода (0xxx): добавляем +996
  if (digits.startsWith('0') && digits.length === 10) {
    const n = digits.slice(1);
    return `+996 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  // Просто 9 цифр без нуля
  if (digits.length === 9 && !digits.startsWith('0')) {
    return `+996 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  // Другая страна или непонятный формат — оставляем
  return phone.trim();
}
