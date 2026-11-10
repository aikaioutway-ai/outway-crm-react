export const SPENDING_PAYMENT_METHODS = ['Безналичные', 'АйКай Бакай', 'Наличные'];

export function formatSpendingPaymentMethod(method: string): string {
  return method === 'Безналичные' ? 'АйКай Мбанк' : method;
}
