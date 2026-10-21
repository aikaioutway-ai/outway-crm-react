import { useRef, useState } from 'react';
import { extractReceiptData } from '../services/receiptOcr';

const MAX_FILE_SIZE_MB = 10;

export interface ReceiptOcrState {
  ocrLoading: boolean;
  ocrMsg: string;
  receiptFile: File | null;
  receiptCode: string;
  receiptTime: string;setReceiptTime:(value:string)=>void;
  receiptCardLast4:string;setReceiptCardLast4:(value:string)=>void;
  receiptBank:string;setReceiptBank:(value:string)=>void;
  setReceiptCode: (code: string) => void;
  handleFileChange: (
    file: File | null,
    onExtracted?: (amount: number | null, date: string | null) => void,
  ) => Promise<void>;
  reset: () => void;
}

export function useReceiptOcr(): ReceiptOcrState {
  const requestId=useRef(0);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMsg, setOcrMsg] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptTime,setReceiptTime]=useState('');
  const [receiptCardLast4,setReceiptCardLast4]=useState('');
  const [receiptBank,setReceiptBank]=useState('');
  const [receiptCode, setReceiptCode] = useState('');

  async function handleFileChange(
    file: File | null,
    onExtracted?: (amount: number | null, date: string | null) => void,
  ) {
    const currentRequest=++requestId.current;
    setOcrLoading(false);
    setOcrMsg('');
    setReceiptFile(file);
    setReceiptCode('');setReceiptTime('');setReceiptCardLast4('');setReceiptBank('');
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setOcrMsg(`Файл слишком большой (макс. ${MAX_FILE_SIZE_MB} МБ)`);
      return;
    }

    setOcrLoading(true);
    setOcrMsg('');
    try {
      const result = await extractReceiptData(file);
      if(currentRequest!==requestId.current)return;
      setReceiptTime(result.time ?? '');setReceiptCardLast4(result.card_last4 ?? '');setReceiptBank(result.bank ?? '');
      if (result.receipt_code) setReceiptCode(result.receipt_code);
      onExtracted?.(result.amount, result.date);
      setOcrMsg(result.receipt_code ? '✓ Данные извлечены из чека' : 'Код чека не найден — введите вручную');
    } catch (e: any) {
      if(currentRequest!==requestId.current)return;
      console.error('OCR error:', e);
      setOcrMsg(`OCR недоступен — ${e?.message ?? 'неизвестная ошибка'}`);
    } finally {
      if(currentRequest===requestId.current)setOcrLoading(false);
    }
  }

  function reset() {
    requestId.current++;setOcrLoading(false);
    setReceiptFile(null);setReceiptTime('');setReceiptCardLast4('');setReceiptBank('');
    setReceiptCode('');
    setOcrMsg('');
  }

  return { receiptTime,setReceiptTime,receiptCardLast4,setReceiptCardLast4,receiptBank,setReceiptBank,ocrLoading, ocrMsg, receiptFile, receiptCode, setReceiptCode, handleFileChange, reset };
}
