import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { MAX_RECEIPT_BYTES, processIncomingReceipt, type IncomingReceipt, type ReceiptDeps, type RecognizedReceipt } from './greenApiReceipt.ts';
import { RECEIPT_OCR_PROMPT } from './receiptOcrPrompt.ts';
import { normalizeReceiptOcrResult } from './statementMatching.ts';

export function createReceiptProcessor(supabase: SupabaseClient) {
  const BUCKET = 'incoming-receipts';
  const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  const OCR_MODEL = Deno.env.get('ANTHROPIC_OCR_MODEL') ?? 'claude-haiku-4-5-20251001';
  function toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  }

  async function download(url: string): Promise<Uint8Array> {
    if (!url.startsWith('https://')) throw new Error('unsupported_url');
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error('download_status');
    if (Number(response.headers.get('content-length') ?? 0) > MAX_RECEIPT_BYTES) throw new Error('file_too_large');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_RECEIPT_BYTES) throw new Error('file_too_large');
    return bytes;
  }

  async function sha256(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  }

  async function recognize(bytes: Uint8Array, mimeType: string): Promise<RecognizedReceipt> {
    const data = toBase64(bytes);
    const file = mimeType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: mimeType, data } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType, data } };
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: OCR_MODEL,
        max_tokens: 512,
        temperature: 0,
        messages: [{ role: 'user', content: [file, { type: 'text', text: RECEIPT_OCR_PROMPT }] }],
      }),
    });
    if (!response.ok) throw new Error('ocr_status');
    const result = await response.json();
    const output = (result.content ?? [])
      .filter((block: { type?: string }) => block.type === 'text')
      .map((block: { text?: string }) => block.text ?? '')
      .join('');
    const json = output.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return { receipt_code: null, time: null, card_last4: null, bank: null, amount: null, date: null };
    return normalizeReceiptOcrResult(JSON.parse(json));
  }

  const deps: ReceiptDeps = {
    download,
    sha256,
    recognize,
    storeFile: async (path, bytes, mimeType) => {
      const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: mimeType, upsert: true });
      if (error) throw new Error(error.message);
    },
    findDuplicate: async ({ hash, receipt }) => {
      const { data, error } = await supabase.rpc('find_receipt_duplicate', {
        p_code: receipt.receipt_code,
        p_hash: hash,
        p_bank: receipt.bank,
        p_time: receipt.time,
        p_card: receipt.card_last4,
        p_amount: receipt.amount,
        p_date: receipt.date,
      });
      if (error) throw new Error(error.message);
      return data?.[0] ?? null;
    },
    findFamilies: async (suffix) => {
      const { data, error } = await supabase.rpc('find_families_by_phone_suffix', { p_suffix: suffix });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row: { family_id: string }) => row.family_id);
    },
    now: () => new Date().toISOString(),
  };


  return async (id: string, receipt: IncomingReceipt) => {
    let patch: Record<string, unknown>;
    try { patch = await processIncomingReceipt(id, receipt, deps); }
    catch { patch = { status: 'failed', error: 'processing_failed', processed_at: new Date().toISOString() }; }
    const { error } = await supabase.from('v2_incoming_receipts').update(patch).eq('id', id);
    if (error) throw new Error('Не удалось сохранить результат обработки');
    return patch.status as string;
  };
}
