import { SUPABASE_KEY, SUPABASE_URL } from './supabase';

export type DriverTelegramGroupStatus = 'pending' | 'linked';

export interface DriverTelegramGroup {
  chatId: number;
  title: string;
  status: DriverTelegramGroupStatus;
  transferId: string | null;
  driverId: string | null;
  driverConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type DriverTelegramGroupRow = {
  chat_id: number;
  title: string;
  status: DriverTelegramGroupStatus;
  transfer_id: string | null;
  driver_id: string | null;
  driver_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapGroup(row: DriverTelegramGroupRow): DriverTelegramGroup {
  return {
    chatId: Number(row.chat_id),
    title: row.title,
    status: row.status,
    transferId: row.transfer_id,
    driverId: row.driver_id,
    driverConfirmedAt: row.driver_confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function callDriverTelegramAdmin<T>(
  sessionToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!sessionToken) {
    throw new Error('Сессия устарела. Выйдите из CRM и войдите заново.');
  }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/telegram-driver-bot/admin/crm`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        authorization: `Bearer ${sessionToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  const data = await response.json().catch(() => ({})) as {
    ok?: boolean;
    error?: string;
  } & T;
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Не удалось выполнить действие Telegram.');
  }
  return data;
}

export async function fetchDriverTelegramGroups(
  sessionToken: string,
): Promise<DriverTelegramGroup[]> {
  const data = await callDriverTelegramAdmin<{ groups: DriverTelegramGroupRow[] }>(
    sessionToken,
    { action: 'list_groups' },
  );
  return (data.groups ?? []).map(mapGroup);
}

export async function linkDriverTelegramGroup(params: {
  sessionToken: string;
  chatId: number;
  transferId: string;
  driverId: string;
}): Promise<DriverTelegramGroup> {
  const data = await callDriverTelegramAdmin<{ group: DriverTelegramGroupRow }>(
    params.sessionToken,
    {
      action: 'link_group',
      chat_id: params.chatId,
      transfer_id: params.transferId,
      driver_id: params.driverId,
    },
  );
  return mapGroup(data.group);
}
