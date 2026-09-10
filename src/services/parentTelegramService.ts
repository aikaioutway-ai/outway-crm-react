import { SUPABASE_KEY, SUPABASE_URL } from './supabase';

export type ParentTelegramStatus = 'not_connected' | 'connected' | 'invited' | 'no_telegram' | 'declined';

export interface ParentTelegramMember {
  familyId: string;
  parentName: string;
  phone: string;
  childrenNames: string;
  address: string;
  status: ParentTelegramStatus;
  automaticStatus: ParentTelegramStatus;
  manual: boolean;
}

export interface ParentTelegramTransferGroup {
  transferId: string;
  transferNumber: number;
  branchId: string;
  branchName: string;
  branchCode: string;
  title: string;
  adminPhone: string;
  members: ParentTelegramMember[];
}

async function callParentTelegramAdmin<T>(sessionToken: string, body: Record<string, unknown>): Promise<T> {
  if (!sessionToken) throw new Error('Сессия устарела. Войдите в CRM заново.');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/telegram-manager-bot/admin/crm`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      authorization: `Bearer ${sessionToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string } & T;
  if (!response.ok || !data.ok) throw new Error(data.error || 'Не удалось выполнить действие Telegram.');
  return data;
}

export async function fetchParentTelegramTransferGroup(params: {
  sessionToken: string;
  branchId: string;
  transferNumber: number;
}): Promise<ParentTelegramTransferGroup> {
  const data = await callParentTelegramAdmin<{ group: ParentTelegramTransferGroup }>(params.sessionToken, {
    action: 'get_transfer_group',
    branch_id: params.branchId,
    transfer_number: params.transferNumber,
  });
  return data.group;
}

export async function saveParentTelegramTransferGroup(params: {
  sessionToken: string;
  transferId: string;
  title: string;
  adminPhone: string;
}): Promise<void> {
  await callParentTelegramAdmin(params.sessionToken, {
    action: 'save_transfer_group',
    transfer_id: params.transferId,
    title: params.title,
    admin_phone: params.adminPhone,
  });
}

export async function setParentTelegramMemberStatus(params: {
  sessionToken: string;
  transferId: string;
  familyId: string;
  status: ParentTelegramStatus | null;
}): Promise<void> {
  await callParentTelegramAdmin(params.sessionToken, {
    action: 'set_member_status',
    transfer_id: params.transferId,
    family_id: params.familyId,
    status: params.status,
  });
}
