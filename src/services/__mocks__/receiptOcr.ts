export interface OcrResult {
  receipt_code: string | null;
  amount: number | null;
  date: string | null;
}

export async function extractReceiptData(): Promise<OcrResult> {
  return { receipt_code: null, amount: null, date: null };
}
