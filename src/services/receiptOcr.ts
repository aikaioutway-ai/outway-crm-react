export interface OcrResult {
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

const PROMPT = `Извлеки из этого банковского чека:
1. receipt_code — возьми значение поля "Идентификатор транзакции" или "ID транзакции" (например 29e98b10-a039-4186-8084-15f97c646360). Если такого поля нет — возьми "Описание". НЕ включай время (ЧЧ:ММ:СС) — только сам код.
2. amount — сумма в сомах (только число, без "KGS" и пробелов)
3. date — дата в формате YYYY-MM-DD

Верни только JSON без пояснений: {"receipt_code": "...", "amount": 5500, "date": "2026-06-10"}
Если поле не найдено — ставь null.`;

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

  const apiKey = process.env.REACT_APP_ANTHROPIC_API_KEY ?? '';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error: ${err}`);
  }

  const data = await res.json();
  const text = (data.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { receipt_code: null, amount: null, date: null };

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    let code: string | null = parsed.receipt_code ?? null;
    // Убираем префикс времени вида "21:03:38/" если есть
    if (code) code = code.replace(/^\d{2}:\d{2}:\d{2}\//, '');
    return {
      receipt_code: code,
      amount: parsed.amount != null ? Number(parsed.amount) : null,
      date: parsed.date ?? null,
    };
  } catch {
    return { receipt_code: null, amount: null, date: null };
  }
}
// build: Mon Jun 22 15:35:20 +06 2026
