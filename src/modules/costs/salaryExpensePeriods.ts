export function salaryExpensePeriods(startYear: number) {
  const names = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  return Array.from({ length: 9 }, (_, index) => {
    const month = (index + 8) % 12 + 1;
    const year = month >= 9 ? startYear : startYear + 1;
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return [
      { key: `${prefix}-1`, label: `${names[month - 1]} ${year} · 1–15` },
      { key: `${prefix}-2`, label: `${names[month - 1]} ${year} · 16–${new Date(year, month, 0).getDate()}` },
    ];
  }).flat();
}
export function currentSchoolYear() {
  const now = new Date();
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}
