import { supabase } from './supabase';

export interface ReceiptDetails { time?:string; cardLast4?:string; bank?:string }
export interface ReceiptDuplicate { payment_id:string;family_id:string;parent_name:string;amount:number;payment_date:string;match_type:'file'|'code'|'details' }

export async function receiptFileHash(file:File):Promise<string> {
  const bytes=await file.arrayBuffer();
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
}

export function duplicateReceiptMessage(duplicate:ReceiptDuplicate):string {
  const reason=duplicate.match_type==='file'?'этот файл уже загружен':duplicate.match_type==='code'?'совпадает уникальный код':'совпадают банк, сумма, дата, время и последние цифры счёта';
  return `Дубль чека: ${reason}. Уже есть платёж у семьи «${duplicate.parent_name}» (${duplicate.family_id}) на ${duplicate.amount} сом от ${duplicate.payment_date}. Платёж: ${duplicate.payment_id}. Повторная отправка на проверку запрещена.`;
}

export async function assertNoReceiptDuplicate(params:{code?:string;hash?:string;details?:ReceiptDetails;amount:number;date:string}):Promise<void> {
  if(!params.code && !params.hash && !params.details?.time)return;
  const {data,error}=await supabase.rpc('find_receipt_duplicate',{
    p_code:params.code || null,p_hash:params.hash || null,p_bank:params.details?.bank || null,
    p_time:params.details?.time || null,p_card:params.details?.cardLast4 || null,p_amount:params.amount,p_date:params.date,
  });
  if(error)throw new Error(`Не удалось проверить чек на дубли: ${error.message}. Отправка остановлена.`);
  if(data?.[0])throw new Error(duplicateReceiptMessage(data[0]));
}
