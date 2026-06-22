import { useState } from 'react';
import { extractReceiptData } from '../services/receiptOcr';

const MAX_FILE_SIZE_MB = 10;

export interface ReceiptOcrState {
  ocrLoading: boolean;
  ocrMsg: string;
  receiptFile: File | null;
  receiptCode: string;
  setReceiptCode: (code: string) => void;
  handleFileChange: (
    file: File | null,
    onExtracted?: (amount: number | null, date: string | null) => void,
  ) => Promise<void>;
  reset: () => void;
}

export function useReceiptOcr(): ReceiptOcrState {
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMsg, setOcrMsg] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptCode, setReceiptCode] = useState('');

  async function handleFileChange(
    file: File | null,
    onExtracted?: (amount: number | null, date: string | null) => void,
  ) {
    setReceiptFile(file);
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setOcrMsg(`Файл слишком большой (макс. ${MAX_FILE_SIZE_MB} МБ)`);
      return;
    }

    setOcrLoading(true);
    setOcrMsg('');
    try {
      const result = await extractReceiptData(file);
      if (result.receipt_code) setReceiptCode(result.receipt_code);
      onExtracted?.(result.amount, result.date);
      setOcrMsg(result.receipt_code ? '✓ Данные извлечены из чека' : 'Код чека не найден — введите вручную');
    } catch (e: any) {
      console.error('OCR error:', e);
      setOcrMsg(`OCR недоступен — ${e?.message ?? 'неизвестная ошибка'}`);
    }
    setOcrLoading(false);
  }

  function reset() {
    setReceiptFile(null);
    setReceiptCode('');
    setOcrMsg('');
  }

  return { ocrLoading, ocrMsg, receiptFile, receiptCode, setReceiptCode, handleFileChange, reset };
}
