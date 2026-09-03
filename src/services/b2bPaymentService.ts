export type B2BPaymentStatus = 'pending' | 'confirmed' | 'rejected';
export type B2BPaymentMethod = 'cash' | 'legal_account' | 'personal_account';

export const B2B_PAYMENT_METHODS: { value: B2BPaymentMethod; label: string; hint: string }[] = [
  { value: 'cash', label: 'Наличные', hint: 'Оплата наличными' },
  { value: 'legal_account', label: 'Безнал — юрлицо', hint: 'Расчётный счёт компании' },
  { value: 'personal_account', label: 'Безнал — физлицо', hint: 'Личная карта или QR' },
];

export function normalizeB2BPaymentMethod(value: unknown): B2BPaymentMethod {
  if (value === 'legal_account' || value === 'qr' || value === 'cashless' || value === 'osu') return 'legal_account';
  if (value === 'personal_account' || value === 'bank_account') return 'personal_account';
  return 'cash';
}

export function formatB2BPaymentMethod(value: unknown): string {
  const normalized = normalizeB2BPaymentMethod(value);
  return B2B_PAYMENT_METHODS.find(method => method.value === normalized)?.label ?? 'Наличные';
}

export const B2B_LEGAL_ACCOUNT_TAX_RATE = 0.04;

export function calculateB2BExpenseTax(amount: number, method: unknown) {
  const grossAmount = Math.max(0, Number(amount) || 0);
  const taxAmount = normalizeB2BPaymentMethod(method) === 'legal_account'
    ? Math.round(grossAmount * B2B_LEGAL_ACCOUNT_TAX_RATE * 100) / 100
    : 0;
  return { grossAmount, taxAmount, netAmount: Math.round((grossAmount - taxAmount) * 100) / 100 };
}

export interface B2BPaymentRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  clientName: string;
  amount: number;
  method: B2BPaymentMethod;
  paymentDate: string;
  comment: string;
  status: B2BPaymentStatus;
  createdAt: string;
}
