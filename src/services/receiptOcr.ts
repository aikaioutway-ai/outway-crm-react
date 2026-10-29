import { normalizeReceiptOcrResult } from './receiptOcrResult';
export interface OcrResult {
  bank: string | null;
  time: string | null;
  card_last4: string | null;
  receipt_code: string | null;
  amount: number | null;
  date: string | null;
}

async function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, base64] = result.split(',');
      const mediaType = header.replace('data:', '').replace(';base64', '');
      resolve({ base64, mediaType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const PROMPT = `Извлеки данные банковского чека. Верни только JSON:
{"receipt_code":null,"amount":null,"date":null,"time":null,"card_last4":null,"bank":null}
receipt_code: ID транзакции, ELQR ID или номер квитанции; если их нет — код из описания/комментария, включая mbiz:, MBIZ_S_, QR_. Сохрани весь код, не путай его с временем. Бери только код, напечатанный в чеке; не составляй его из названия получателя или операции («ОсОО АйКай Груп», «Платеж по QR») — если кода нет, верни null.
amount: итоговая сумма перевода без комиссии, число в сомах.
date: дата самой операции YYYY-MM-DD, не дата загрузки.
time: время самой операции HH:MM:SS, либо HH:MM, если секунды не указаны. Не добавляй отсутствующие секунды и не используй часы телефона.
card_last4: последние 4 цифры карты или счёта ОТПРАВИТЕЛЯ (поля «Откуда», «Счёт списания», Payer requisites). Верни строку из четырёх цифр, сохраняя нули. Не используй реквизиты получателя, mbiz или номер квитанции.
bank: название банка, выдавшего чек (например Optima Bank, Bakai Bank, DemirBank, MBANK). Не банк получателя или поставщик услуг c2b.mbank.kg.
Примеры форматов (не подставляй эти значения в ответ):
Optima24: поле «Откуда **** 7985», дата «06 окт. 2026, 17:39», операция с mbiz: — извлекай card_last4="7985", time="17:39", date="2026-10-06", bank="Optima Bank"; сам mbiz оставь в receipt_code.
Bakai: используй ELQR ID как код, время из «Дата создания», карту из «Счёт списания»; игнорируй mbiz комментария при наличии ELQR ID.
DemirBank: используй ID transaction как код, время из Transaction date and time, карту из Payer requisites.
MBANK: код может быть в «Детали операции» и содержать MBIZ_S_/QR_; банк определяется по логотипу чека.
Если поле отсутствует или неразборчиво — null. Не придумывай данные.`;

async function readErrorMessage(res: Response): Promise<string> {
  const fallback = `сервер вернул ${res.status}`;

  try {
    const text = await res.text();
    if (!text) return fallback;

    try {
      const parsed = JSON.parse(text);
      const message = parsed?.error?.message || parsed?.error || parsed?.message;
      return typeof message === 'string' ? message : fallback;
    } catch {
      return text.length > 180 ? `${text.slice(0, 180)}...` : text;
    }
  } catch {
    return fallback;
  }
}

export async function extractReceiptData(file: File): Promise<OcrResult> {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Файл слишком большой (макс. 10 МБ)');
  }

  const { base64, mediaType } = await fileToBase64(file);
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  const content: any[] = isPdf
    ? [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: PROMPT },
      ]
    : [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: PROMPT },
      ];

  const endpoint = import.meta.env.DEV ? '/anthropic/v1/messages' : '/api/receipt-ocr';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      temperature: 0,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const err = await readErrorMessage(res);
    throw new Error(err);
  }

  const data = await res.json();
  const text = (data.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { receipt_code: null, amount: null, date: null, time:null,card_last4:null,bank:null };

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return normalizeReceiptOcrResult(parsed);
  } catch {
    return { receipt_code: null, amount: null, date: null, time:null,card_last4:null,bank:null };
  }
}
// build: Mon Jun 22 15:35:20 +06 2026
