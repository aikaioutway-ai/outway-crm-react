export interface OcrResult {
  time:string|null;card_last4:string|null;bank:string|null;
  receipt_code: string | null;
  amount: number | null;
  date: string | null;
}

export async function extractReceiptData(): Promise<OcrResult> {
  return { time:null,card_last4:null,bank:null,receipt_code: null, amount: null, date: null };
}
