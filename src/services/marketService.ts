import { supabase } from './supabase';
import {
  MarketClient, MarketClientDraft, MarketOrder, MarketOrderItem, MarketOrderStatus,
  MarketProduct, MarketProductDraft, MarketSchoolOption, NewMarketOrder,
} from '../modules/market/marketTypes';

function mapProduct(row: any): MarketProduct {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    category: String(row.category ?? ''),
    unit: String(row.unit ?? 'шт'),
    purchasePrice: Number(row.purchase_price ?? 0),
    salePrice: Number(row.sale_price ?? 0),
    active: Boolean(row.active),
    createdAt: String(row.created_at ?? ''),
  };
}

function mapClient(row: any): MarketClient {
  return {
    id: String(row.id),
    schoolId: row.school_id ? String(row.school_id) : null,
    schoolName: row.school_name ? String(row.school_name) : undefined,
    name: String(row.name ?? ''),
    contactPerson: String(row.contact_person ?? ''),
    phone: String(row.phone ?? ''),
    address: String(row.address ?? ''),
    login: String(row.login ?? ''),
    active: Boolean(row.active),
    comment: String(row.comment ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}

function mapOrderItem(row: any): MarketOrderItem {
  return {
    id: String(row.id),
    productId: row.product_id ? String(row.product_id) : null,
    productName: String(row.product_name ?? ''),
    unit: String(row.unit ?? ''),
    quantity: Number(row.quantity ?? 0),
    purchasePrice: Number(row.purchase_price ?? 0),
    salePrice: Number(row.sale_price ?? 0),
    purchaseAmount: Number(row.purchase_amount ?? 0),
    saleAmount: Number(row.sale_amount ?? 0),
  };
}

function mapOrder(row: any): MarketOrder {
  return {
    id: String(row.id),
    orderNumber: Number(row.order_number ?? 0),
    clientId: String(row.client_id ?? ''),
    clientName: String(row.client_name ?? ''),
    status: row.status as MarketOrderStatus,
    totalPurchaseAmount: Number(row.total_purchase_amount ?? 0),
    totalSaleAmount: Number(row.total_sale_amount ?? 0),
    deliveryDate: row.delivery_date ? String(row.delivery_date) : null,
    createdVia: row.created_via === 'portal' ? 'portal' : 'crm',
    createdBy: row.created_by ? String(row.created_by) : null,
    comment: String(row.comment ?? ''),
    paidAt: row.paid_at ? String(row.paid_at) : null,
    paidComment: String(row.paid_comment ?? ''),
    settledAt: row.settled_at ? String(row.settled_at) : null,
    settledComment: String(row.settled_comment ?? ''),
    createdAt: String(row.created_at ?? ''),
    items: Array.isArray(row.items) ? row.items.map(mapOrderItem) : [],
  };
}

async function callMarketApi(sessionToken: string | undefined, body: Record<string, unknown>): Promise<any> {
  if (!sessionToken) throw new Error('Сессия устарела. Выйдите и войдите в CRM снова.');
  const { data, error } = await supabase.functions.invoke('market-api', {
    body,
    headers: { 'x-employee-session': sessionToken },
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || 'Ошибка сервера Маркета');
  return data;
}

export async function fetchMarketProducts(sessionToken?: string): Promise<MarketProduct[]> {
  const data = await callMarketApi(sessionToken, { action: 'listProducts' });
  return (data.rows ?? []).map(mapProduct);
}

export async function saveMarketProduct(product: MarketProductDraft & { id?: string }, sessionToken?: string): Promise<MarketProduct> {
  const action = product.id ? 'updateProduct' : 'createProduct';
  const data = await callMarketApi(sessionToken, { action, product });
  return mapProduct(data.row);
}

export async function fetchMarketSchools(sessionToken?: string): Promise<MarketSchoolOption[]> {
  const data = await callMarketApi(sessionToken, { action: 'listSchools' });
  return (data.rows ?? []).map((row: any) => ({ id: String(row.id), name: String(row.name ?? ''), code: String(row.code ?? '') }));
}

export async function fetchMarketClients(sessionToken?: string): Promise<MarketClient[]> {
  const data = await callMarketApi(sessionToken, { action: 'listClients' });
  return (data.rows ?? []).map(mapClient);
}

export async function saveMarketClient(client: MarketClientDraft & { id?: string }, sessionToken?: string): Promise<MarketClient> {
  const action = client.id ? 'updateClient' : 'createClient';
  const data = await callMarketApi(sessionToken, { action, client });
  return mapClient(data.row);
}

export async function fetchMarketOrders(status: MarketOrderStatus | 'ALL', sessionToken?: string): Promise<MarketOrder[]> {
  const data = await callMarketApi(sessionToken, { action: 'listOrders', status });
  return (data.rows ?? []).map(mapOrder);
}

export async function createMarketOrder(order: NewMarketOrder, sessionToken?: string): Promise<MarketOrder> {
  const data = await callMarketApi(sessionToken, { action: 'createOrder', order });
  return mapOrder(data.row);
}

export async function advanceMarketOrderStatus(orderId: string, sessionToken?: string): Promise<MarketOrder> {
  const data = await callMarketApi(sessionToken, { action: 'advanceStatus', orderId });
  return mapOrder(data.row);
}

export async function markMarketOrderPaid(orderId: string, comment: string, sessionToken?: string): Promise<MarketOrder> {
  const data = await callMarketApi(sessionToken, { action: 'markPaid', orderId, comment });
  return mapOrder(data.row);
}

export async function markMarketOrderSettled(orderId: string, comment: string, sessionToken?: string): Promise<MarketOrder> {
  const data = await callMarketApi(sessionToken, { action: 'markSettled', orderId, comment });
  return mapOrder(data.row);
}
