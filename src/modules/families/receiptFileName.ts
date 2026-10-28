// Название скачиваемого чека: фамилия семьи по детям во множественном числе и сумма — «Казыбаевы — 6400 сом.pdf».

function capitalize(word: string): string {
  return word.charAt(0).toLocaleUpperCase('ru-RU') + word.slice(1).toLocaleLowerCase('ru-RU');
}

/** «Казыбаев» и «Казыбаева» → «Казыбаевы»; фамилии без русского окончания (Пак, «Ашим уулу») не меняются. */
export function familySurname(childName: string): string {
  const words = childName.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (/^(уулу|кызы)$/i.test(words[1] ?? '')) return `${capitalize(words[0])} ${words[1].toLocaleLowerCase('ru-RU')}`;
  const surname = capitalize(words[0]);
  if (/(ов|ев|ёв|ин|ын)$/i.test(surname)) return `${surname}ы`;
  if (/(ова|ева|ёва|ина|ына)$/i.test(surname)) return `${surname.slice(0, -1)}ы`;
  return surname;
}

export function receiptDownloadName(params: { childNames: string[]; parentName?: string; amount?: number; originalName: string }): string {
  const extension = params.originalName.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? '';
  const surnames = params.childNames.map(familySurname).filter((name, index, all) => name && all.indexOf(name) === index);
  const who = surnames.length ? surnames.join(', ') : params.parentName?.trim() ?? '';
  if (!who) return params.originalName;
  const amount = params.amount ? ` — ${Math.round(params.amount)} сом` : '';
  return `${who}${amount}${extension}`.replace(/[\\/:*?"<>|]/g, '_');
}
