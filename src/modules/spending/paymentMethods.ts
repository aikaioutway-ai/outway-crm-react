export const SPENDING_PAYMENT_METHODS = ['Безналичные', 'Наличные', 'АйКай Бакай'];

export function formatSpendingPaymentMethod(method: string): string {
  return method === 'Безналичные' ? 'АйКай Мбанк' : method;
}
