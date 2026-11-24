import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { IncomingReceipt } from './greenApiReceipt.ts';
import { createReceiptProcessor } from './receiptProcessor.ts';

export type HistoryImportResult = 'imported' | 'existing' | 'other' | 'failed';

export async function importHistoryReceipt(db: SupabaseClient, receipt: IncomingReceipt): Promise<HistoryImportResult> {
  const { data, error } = await db.from('v2_incoming_receipts').upsert({
    provider: 'green_api', provider_message_id: receipt.messageId, chat_id: receipt.chatId,
    chat_name: receipt.chatName, message_at: receipt.messageAt,
  }, { onConflict: 'provider,provider_message_id', ignoreDuplicates: true }).select('id').maybeSingle();
  if (error) throw new Error('Не удалось сохранить входящий файл');
  let id = data?.id;
  if (!id) {
    const { data: existing, error: lookupError } = await db.from('v2_incoming_receipts')
      .select('id,status,processed_at,created_at,payment_id').eq('provider', 'green_api').eq('provider_message_id', receipt.messageId).maybeSingle();
    if (lookupError) throw new Error('Не удалось проверить входящий файл');
    if (!existing || existing.payment_id) return 'existing';
    // Атомарно забрать неудавшийся или зависший файл. Успешные и ручные решения не перезаписываем.
    const cutoff = new Date(Date.now() - 180000).toISOString();
    let claim = db.from('v2_incoming_receipts').update({ status: 'received', processed_at: new Date().toISOString() })
      .eq('id', existing.id).eq('status', existing.status).is('payment_id', null);
    if (existing.status === 'received') {
      claim = existing.processed_at ? claim.lt('processed_at', cutoff) : claim.is('processed_at', null).lt('created_at', cutoff);
    } else if (existing.status !== 'failed') return 'existing';
    const { data: retry, error: retryError } = await claim.select('id').maybeSingle();
    if (retryError) throw new Error('Не удалось повторить обработку файла');
    id = retry?.id;
  }
  if (!id) return 'existing';
  const status = await createReceiptProcessor(db)(id, receipt);
  return status === 'failed' ? 'failed' : status === 'other' ? 'other' : 'imported';
}
