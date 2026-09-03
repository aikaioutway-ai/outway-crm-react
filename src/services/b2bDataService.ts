import { supabase } from './supabase';
import type { B2BPaymentMethod, B2BPaymentRecord, B2BPaymentStatus } from './b2bPaymentService';

export type B2BOrderStatus = 'new' | 'in_progress' | 'completed' | 'cancelled' | 'driver_assigned' | 'trip_completed' | 'ready_to_close' | 'success';

export interface B2BOrderRecord {
  id: string;
  number: string;
  clientId: string;
  client: string;
  category: 'private' | 'b2b' | 'school_trip';
  routeFrom: string;
  routeTo: string;
  requestDate: string;
  departureDate: string;
  transport: string;
  transportCount: number;
  pricePerUnit: number;
  total: number;
  paid: number;
  status: B2BOrderStatus;
  assignmentId?: string;
  driverId?: string;
  driverName: string;
  driverPricePerUnit?: number;
}

export interface B2BDriverPayoutRecord {
  id: string;
  orderId: string;
  assignmentId: string;
  driverId: string;
  driverName: string;
  amount: number;
  taxAmount: number;
  netAmount: number;
  method: B2BPaymentMethod;
  paymentDate: string;
  comment: string;
  createdAt: string;
}

export interface B2BClientRecord {
  id: string;
  clientType: 'individual' | 'company' | 'school';
  companyName: string;
  contactName: string;
  phone1: string;
  phone2: string;
  email: string;
  comments: string;
  orgName: string;
  inn: string;
  okpo: string;
  legalAddress: string;
  bankName: string;
  bik: string;
  bankAccount: string;
  signerPosition: string;
  signerName: string;
}

export interface B2BExpenseRecord {
  id: string;
  expenseDate: string;
  category: string;
  amount: number;
  method: B2BPaymentMethod;
  taxAmount: number;
  netAmount: number;
  purpose: string;
  orderNumber: string;
  comment: string;
  source: string;
}

const transportLabel = (value: string) => ({
  sedan: 'Легковое', comfort: 'Комфорт', minivan: 'Минивэн', minibus: 'Микроавтобус',
}[value] ?? value);

const transportValue = (value: string) => ({
  'Легковое': 'sedan', 'Комфорт': 'comfort', 'Минивэн': 'minivan', 'Микроавтобус': 'minibus',
}[value] ?? value);

const dateLabel = (value: string | null) => {
  if (!value) return '';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
};

const assert = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

export async function fetchB2BOrders(): Promise<B2BOrderRecord[]> {
  const { data, error } = await supabase.from('v2_b2b_orders').select(`
    *, client:v2_b2b_clients(company_name, contact_name),
    assignments:v2_b2b_order_driver_assignments(
      id, driver_id, driver_price, driver_total, created_at,
      driver:v2_drivers(full_name)
    )
  `).order('request_date', { ascending: false });
  assert(error);
  return (data ?? []).map((row: any) => {
    const assignments = [...(row.assignments ?? [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const assignment = assignments[0];
    return {
      id: row.id,
      number: row.order_number,
      clientId: row.client_id,
      client: row.client?.company_name || row.client?.contact_name || 'Без клиента',
      category: row.category,
      routeFrom: row.route_from,
      routeTo: row.route_to,
      requestDate: dateLabel(row.request_date),
      departureDate: dateLabel(row.departure_date),
      transport: transportLabel(row.transport_type),
      transportCount: Number(row.transport_count),
      pricePerUnit: Number(row.price_per_unit),
      total: Number(row.total),
      paid: 0,
      status: row.status,
      assignmentId: assignment?.id,
      driverId: assignment?.driver_id,
      driverName: assignment?.driver?.full_name ?? '',
      driverPricePerUnit: assignment ? Number(assignment.driver_price) : undefined,
    };
  });
}

export async function fetchB2BDriverPayouts(): Promise<B2BDriverPayoutRecord[]> {
  const { data, error } = await supabase.from('v2_b2b_driver_payments').select('*, driver:v2_drivers(full_name)').order('payment_date', { ascending: false });
  assert(error);
  return (data ?? []).map((row: any) => ({
    id: row.id, orderId: row.order_id, assignmentId: row.assignment_id, driverId: row.driver_id,
    driverName: row.driver?.full_name ?? '', amount: Number(row.amount), taxAmount: Number(row.tax_amount),
    netAmount: Number(row.net_amount), method: row.payment_method, paymentDate: row.payment_date,
    comment: row.purpose ?? '', createdAt: row.created_at,
  }));
}

export async function fetchB2BPayments(): Promise<B2BPaymentRecord[]> {
  const { data, error } = await supabase.from('v2_b2b_client_payments').select(`
    *, order:v2_b2b_orders(order_number, client:v2_b2b_clients(company_name, contact_name))
  `).order('payment_date', { ascending: false });
  assert(error);
  return (data ?? []).map((row: any) => ({
    id: row.id, orderId: row.order_id, orderNumber: row.order?.order_number ?? '—',
    clientName: row.order?.client?.company_name || row.order?.client?.contact_name || '—',
    amount: Number(row.amount), method: row.payment_method, paymentDate: row.payment_date,
    comment: row.comment ?? '', status: row.status, createdAt: row.created_at,
  }));
}

export async function fetchB2BClients(): Promise<B2BClientRecord[]> {
  const { data, error } = await supabase.from('v2_b2b_clients').select('*').order('company_name', { ascending: true, nullsFirst: false });
  assert(error);
  return (data ?? []).map((row: any) => ({
    id: row.id, clientType: row.client_type, companyName: row.company_name ?? '', contactName: row.contact_name,
    phone1: row.phone1, phone2: row.phone2 ?? '', email: row.email ?? '', comments: row.comments ?? '',
    orgName: row.org_name ?? '', inn: row.inn ?? '', okpo: row.okpo ?? '', legalAddress: row.legal_address ?? '',
    bankName: row.bank_name ?? '', bik: row.bik ?? '', bankAccount: row.bank_account ?? '',
    signerPosition: row.signer_position ?? '', signerName: row.signer_name ?? '',
  }));
}

export async function fetchB2BExpenses(): Promise<B2BExpenseRecord[]> {
  const { data, error } = await supabase.from('v2_b2b_expenses').select('*, order:v2_b2b_orders(order_number)').order('expense_date', { ascending: false });
  assert(error);
  return (data ?? []).map((row: any) => ({
    id: row.id, expenseDate: row.expense_date, category: row.category, amount: Number(row.amount),
    method: row.payment_method, taxAmount: Number(row.tax_amount), netAmount: Number(row.net_amount),
    purpose: row.purpose ?? '', orderNumber: row.order?.order_number ?? '—', comment: row.comment ?? '', source: row.source,
  }));
}

export async function createB2BClient(client: Omit<B2BClientRecord, 'id'>): Promise<B2BClientRecord> {
  const payload = {
    client_type: client.clientType, company_name: client.companyName || null, contact_name: client.contactName,
    phone1: client.phone1, phone2: client.phone2 || null, email: client.email || null, comments: client.comments || null,
    org_name: client.orgName || null, inn: client.inn || null, okpo: client.okpo || null, legal_address: client.legalAddress || null,
    bank_name: client.bankName || null, bik: client.bik || null, bank_account: client.bankAccount || null,
    signer_position: client.signerPosition || null, signer_name: client.signerName || null,
  };
  const { data, error } = await supabase.from('v2_b2b_clients').insert(payload).select('*').single();
  assert(error);
  return { ...client, id: data!.id };
}

export async function updateB2BClient(id: string, client: Omit<B2BClientRecord, 'id'>): Promise<void> {
  const { error } = await supabase.from('v2_b2b_clients').update({
    client_type: client.clientType, company_name: client.companyName || null, contact_name: client.contactName,
    phone1: client.phone1, phone2: client.phone2 || null, email: client.email || null, comments: client.comments || null,
    org_name: client.orgName || null, inn: client.inn || null, okpo: client.okpo || null, legal_address: client.legalAddress || null,
    bank_name: client.bankName || null, bik: client.bik || null, bank_account: client.bankAccount || null,
    signer_position: client.signerPosition || null, signer_name: client.signerName || null,
  }).eq('id', id);
  assert(error);
}

export async function createB2BOrder(order: Pick<B2BOrderRecord, 'clientId' | 'routeFrom' | 'routeTo' | 'requestDate' | 'departureDate' | 'transport' | 'transportCount' | 'pricePerUnit' | 'total' | 'status'> & { category?: B2BOrderRecord['category'] }) {
  const { data: last } = await supabase.from('v2_b2b_orders').select('order_number').order('created_at', { ascending: false }).limit(1);
  const next = Math.max(1, Number(String(last?.[0]?.order_number ?? '').match(/(\d+)$/)?.[1] ?? 0) + 1);
  const payload = {
    order_number: `B2B-${String(next).padStart(3, '0')}`, category: order.category ?? 'b2b', client_id: order.clientId,
    route_from: order.routeFrom, route_to: order.routeTo, request_date: order.requestDate,
    departure_date: order.departureDate || null, transport_type: transportValue(order.transport),
    transport_count: order.transportCount, price_per_unit: order.pricePerUnit, total: order.total, status: order.status,
  };
  const { data, error } = await supabase.from('v2_b2b_orders').insert(payload).select('id, order_number').single();
  assert(error);
  return { id: data!.id, number: data!.order_number };
}

export async function updateB2BOrder(id: string, patch: Partial<B2BOrderRecord>) {
  const payload: Record<string, unknown> = {};
  if (patch.clientId !== undefined) payload.client_id = patch.clientId;
  if (patch.routeFrom !== undefined) payload.route_from = patch.routeFrom;
  if (patch.routeTo !== undefined) payload.route_to = patch.routeTo;
  if (patch.requestDate !== undefined) payload.request_date = patch.requestDate;
  if (patch.departureDate !== undefined) payload.departure_date = patch.departureDate || null;
  if (patch.transport !== undefined) payload.transport_type = transportValue(patch.transport);
  if (patch.transportCount !== undefined) payload.transport_count = patch.transportCount;
  if (patch.pricePerUnit !== undefined) payload.price_per_unit = patch.pricePerUnit;
  if (patch.total !== undefined) payload.total = patch.total;
  if (patch.status !== undefined) payload.status = patch.status;
  const { error } = await supabase.from('v2_b2b_orders').update(payload).eq('id', id);
  assert(error);
}

export async function saveB2BAssignment(order: B2BOrderRecord, driverId: string, driverPrice: number) {
  const payload = { order_id: order.id, driver_id: driverId, driver_price: driverPrice, driver_total: driverPrice * order.transportCount };
  const result = order.assignmentId
    ? await supabase.from('v2_b2b_order_driver_assignments').update(payload).eq('id', order.assignmentId).select('id').single()
    : await supabase.from('v2_b2b_order_driver_assignments').insert(payload).select('id').single();
  assert(result.error);
  await updateB2BOrder(order.id, { status: 'driver_assigned' });
  return result.data!.id as string;
}

export async function createB2BDriverPayout(order: B2BOrderRecord, amount: number, method: B2BPaymentMethod, paymentDate: string, purpose: string) {
  if (!order.assignmentId || !order.driverId) throw new Error('У заказа нет назначения водителя.');
  const { error } = await supabase.from('v2_b2b_driver_payments').insert({
    order_id: order.id, assignment_id: order.assignmentId, driver_id: order.driverId,
    amount, payment_method: method, payment_date: paymentDate, purpose,
  });
  assert(error);
}

export async function createB2BClientPayment(record: Omit<B2BPaymentRecord, 'id' | 'status' | 'createdAt'>) {
  const { error } = await supabase.from('v2_b2b_client_payments').insert({
    order_id: record.orderId, payment_type: 'final', amount: record.amount, payment_date: record.paymentDate,
    payment_method: record.method, status: 'pending', comment: record.comment,
  });
  assert(error);
}

export async function updateB2BClientPayment(id: string, patch: Pick<B2BPaymentRecord, 'amount' | 'method' | 'paymentDate' | 'comment'>) {
  const { error } = await supabase.from('v2_b2b_client_payments').update({ amount: patch.amount, payment_method: patch.method, payment_date: patch.paymentDate, comment: patch.comment }).eq('id', id);
  assert(error);
}

export async function updateB2BPaymentStatus(id: string, status: B2BPaymentStatus) {
  const { error } = await supabase.from('v2_b2b_client_payments').update({ status }).eq('id', id);
  assert(error);
}
