export type MarketOrderStatus = 'new' | 'sent_to_warehouse' | 'packed' | 'delivered' | 'paid' | 'settled';

export interface MarketProduct {
  id: string;
  name: string;
  category: string;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  active: boolean;
  createdAt: string;
}

export interface MarketProductDraft {
  name: string;
  category: string;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  active: boolean;
}

export interface MarketSchoolOption {
  id: string;
  name: string;
  code: string;
}

export interface MarketClient {
  id: string;
  schoolId: string | null;
  schoolName?: string;
  name: string;
  contactPerson: string;
  phone: string;
  address: string;
  login: string;
  active: boolean;
  comment: string;
  createdAt: string;
}

export interface MarketClientDraft {
  schoolId: string | null;
  name: string;
  contactPerson: string;
  phone: string;
  address: string;
  login: string;
  password?: string;
  comment: string;
}

export interface MarketOrderItem {
  id: string;
  productId: string | null;
  productName: string;
  unit: string;
  quantity: number;
  purchasePrice: number;
  salePrice: number;
  purchaseAmount: number;
  saleAmount: number;
}

export interface MarketOrder {
  id: string;
  orderNumber: number;
  clientId: string;
  clientName: string;
  status: MarketOrderStatus;
  totalPurchaseAmount: number;
  totalSaleAmount: number;
  deliveryDate: string | null;
  createdVia: 'crm' | 'portal';
  createdBy: string | null;
  comment: string;
  paidAt: string | null;
  paidComment: string;
  settledAt: string | null;
  settledComment: string;
  createdAt: string;
  items: MarketOrderItem[];
}

export interface NewMarketOrderItem {
  productId: string;
  quantity: number;
}

export interface NewMarketOrder {
  clientId: string;
  deliveryDate: string;
  comment: string;
  items: NewMarketOrderItem[];
}

export const MARKET_ORDER_STATUSES: { key: MarketOrderStatus; label: string; color: string; soft: string }[] = [
  { key: 'new', label: 'Новый', color: '#5267A8', soft: '#EDF0FA' },
  { key: 'sent_to_warehouse', label: 'Отправлен на склад', color: '#D17B2C', soft: '#FFF1E4' },
  { key: 'packed', label: 'Собран', color: '#7B61A8', soft: '#F3EDFA' },
  { key: 'delivered', label: 'Доставлен', color: '#258B8C', soft: '#E2F5F3' },
  { key: 'paid', label: 'Оплачен', color: '#2E9B4F', soft: '#E7F7EB' },
  { key: 'settled', label: 'Выплачен складу', color: '#17222F', soft: '#EDEFF2' },
];

export function nextMarketOrderStatus(status: MarketOrderStatus): MarketOrderStatus | null {
  const index = MARKET_ORDER_STATUSES.findIndex(item => item.key === status);
  if (index === -1 || index === MARKET_ORDER_STATUSES.length - 1) return null;
  return MARKET_ORDER_STATUSES[index + 1].key;
}

export function marketOrderStatusMeta(status: MarketOrderStatus) {
  return MARKET_ORDER_STATUSES.find(item => item.key === status) ?? MARKET_ORDER_STATUSES[0];
}
