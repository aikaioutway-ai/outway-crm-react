import { supabase } from './supabase';
import { getBranchFilter, SCHOOL_TABS } from '../modules/families/constants';

export type RunDirection = 'morning' | 'evening';
export type RunStatus = 'not_started' | 'active' | 'finished' | 'cancelled';

export interface TransferRun {
  id: string;
  transferId: string;
  driverId: string | null;
  runDate: string;
  direction: RunDirection;
  status: RunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastLocationAt: string | null;
}

export interface SchoolRunsBoardRow {
  schoolKey: string;
  label: string;
  logo?: string;
  morningOnLine: number;
  morningNotStarted: number;
  eveningOnLine: number;
  eveningNotStarted: number;
}

export interface SchoolTransferRunRow {
  transferId: string;
  transferNumber: number;
  driverName: string;
  morning: TransferRun | null;
  evening: TransferRun | null;
}

export interface TransferRunStop {
  id: string;
  runId: string;
  childId: string;
  childName: string;
  address: string;
  latitude: number;
  longitude: number;
  stopOrder: number | null;
  status: string;
}

export interface RunHistoryRow {
  id: string;
  runDate: string;
  direction: RunDirection;
  status: RunStatus;
  schoolKey: string;
  schoolLabel: string;
  transferNumber: number;
  driverName: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface RunsHistorySummary {
  rows: RunHistoryRow[];
  totalRuns: number;
  finishedRuns: number;
  activeRuns: number;
  morningRuns: number;
  eveningRuns: number;
}

// Asia/Bishkek — UTC+6 без перехода на летнее время.
export function todayBishkek(): string {
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function schoolKeyForBranch(branch: { code?: string | null; short_name?: string | null; name?: string | null } | null | undefined): string {
  return getBranchFilter(branch?.name ?? null, branch?.code ?? '');
}

function isOnLine(status: RunStatus | undefined): boolean {
  return status === 'active' || status === 'finished';
}

function mapRun(row: any): TransferRun {
  return {
    id: String(row.id),
    transferId: String(row.transfer_id),
    driverId: row.driver_id ? String(row.driver_id) : null,
    runDate: row.run_date,
    direction: row.direction,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    lastLatitude: row.last_latitude == null ? null : Number(row.last_latitude),
    lastLongitude: row.last_longitude == null ? null : Number(row.last_longitude),
    lastLocationAt: row.last_location_at,
  };
}

async function fetchActiveTransfersWithBranch() {
  const { data, error } = await supabase
    .from('v2_transfers')
    .select('id, transfer_number, driver_id, branch_id, status, v2_school_branches(code, short_name, name)')
    .eq('status', 'active');
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchDriverNames(driverIds: string[]): Promise<Map<string, string>> {
  if (driverIds.length === 0) return new Map();
  const { data, error } = await supabase.from('v2_drivers').select('id, full_name').in('id', driverIds);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((d: any) => [String(d.id), d.full_name ?? '']));
}

export async function fetchTodayRunsBoard(date: string = todayBishkek()): Promise<SchoolRunsBoardRow[]> {
  const [transfers, runsResult] = await Promise.all([
    fetchActiveTransfersWithBranch(),
    supabase.from('v2_transfer_runs').select('transfer_id, direction, status').eq('run_date', date),
  ]);
  if (runsResult.error) throw new Error(runsResult.error.message);

  const statusByTransfer = new Map<string, Partial<Record<RunDirection, RunStatus>>>();
  (runsResult.data ?? []).forEach((r: any) => {
    const key = String(r.transfer_id);
    const entry = statusByTransfer.get(key) ?? {};
    entry[r.direction as RunDirection] = r.status;
    statusByTransfer.set(key, entry);
  });

  const bySchool = new Map<string, SchoolRunsBoardRow>();
  transfers.forEach((t: any) => {
    const schoolKey = schoolKeyForBranch(t.v2_school_branches);
    if (!bySchool.has(schoolKey)) {
      const tab = SCHOOL_TABS.find(s => s.key === schoolKey);
      bySchool.set(schoolKey, {
        schoolKey,
        label: tab?.label ?? schoolKey,
        logo: tab?.logo,
        morningOnLine: 0,
        morningNotStarted: 0,
        eveningOnLine: 0,
        eveningNotStarted: 0,
      });
    }
    const row = bySchool.get(schoolKey)!;
    const statuses = statusByTransfer.get(String(t.id)) ?? {};
    if (isOnLine(statuses.morning)) row.morningOnLine += 1; else row.morningNotStarted += 1;
    if (isOnLine(statuses.evening)) row.eveningOnLine += 1; else row.eveningNotStarted += 1;
  });

  return Array.from(bySchool.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export async function fetchSchoolRuns(schoolKey: string, date: string = todayBishkek()): Promise<SchoolTransferRunRow[]> {
  const transfers = (await fetchActiveTransfersWithBranch())
    .filter((t: any) => schoolKeyForBranch(t.v2_school_branches) === schoolKey);
  if (transfers.length === 0) return [];

  const transferIds = transfers.map((t: any) => String(t.id));
  const driverIds = Array.from(new Set(transfers.map((t: any) => t.driver_id).filter(Boolean).map(String)));

  const [runsResult, driverNameById] = await Promise.all([
    supabase.from('v2_transfer_runs').select('*').in('transfer_id', transferIds).eq('run_date', date),
    fetchDriverNames(driverIds),
  ]);
  if (runsResult.error) throw new Error(runsResult.error.message);

  const runsByTransfer = new Map<string, Partial<Record<RunDirection, any>>>();
  (runsResult.data ?? []).forEach((r: any) => {
    const key = String(r.transfer_id);
    const entry = runsByTransfer.get(key) ?? {};
    entry[r.direction as RunDirection] = r;
    runsByTransfer.set(key, entry);
  });

  return transfers
    .map((t: any) => {
      const entry = runsByTransfer.get(String(t.id)) ?? {};
      return {
        transferId: String(t.id),
        transferNumber: Number(t.transfer_number),
        driverName: t.driver_id ? (driverNameById.get(String(t.driver_id)) ?? '') : '',
        morning: entry.morning ? mapRun(entry.morning) : null,
        evening: entry.evening ? mapRun(entry.evening) : null,
      };
    })
    .sort((a, b) => a.transferNumber - b.transferNumber);
}

export async function fetchRunStops(runId: string): Promise<TransferRunStop[]> {
  const { data, error } = await supabase
    .from('v2_transfer_run_stops')
    .select('*')
    .eq('run_id', runId)
    .order('stop_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    runId: String(row.run_id),
    childId: String(row.child_id),
    childName: row.child_name ?? '',
    address: row.address ?? '',
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    stopOrder: row.stop_order == null ? null : Number(row.stop_order),
    status: row.status ?? 'pending',
  }));
}

export async function fetchRunsHistory(params: { from: string; to: string; schoolKey?: string }): Promise<RunsHistorySummary> {
  const [transfers, runsResult] = await Promise.all([
    supabase.from('v2_transfers').select('id, transfer_number, driver_id, branch_id, v2_school_branches(code, short_name, name)'),
    supabase.from('v2_transfer_runs').select('*').gte('run_date', params.from).lte('run_date', params.to),
  ]);
  if (transfers.error) throw new Error(transfers.error.message);
  if (runsResult.error) throw new Error(runsResult.error.message);

  const transferById = new Map((transfers.data ?? []).map((t: any) => [String(t.id), t]));
  const driverIds = Array.from(new Set((transfers.data ?? []).map((t: any) => t.driver_id).filter(Boolean).map(String)));
  const driverNameById = await fetchDriverNames(driverIds);

  const rows: RunHistoryRow[] = (runsResult.data ?? [])
    .map((r: any): RunHistoryRow | null => {
      const transfer = transferById.get(String(r.transfer_id));
      if (!transfer) return null;
      const schoolKey = schoolKeyForBranch(transfer.v2_school_branches);
      if (params.schoolKey && params.schoolKey !== schoolKey) return null;
      const tab = SCHOOL_TABS.find(s => s.key === schoolKey);
      return {
        id: String(r.id),
        runDate: r.run_date,
        direction: r.direction,
        status: r.status,
        schoolKey,
        schoolLabel: tab?.label ?? schoolKey,
        transferNumber: Number(transfer.transfer_number),
        driverName: transfer.driver_id ? (driverNameById.get(String(transfer.driver_id)) ?? '') : '',
        startedAt: r.started_at,
        finishedAt: r.finished_at,
      };
    })
    .filter((row: RunHistoryRow | null): row is RunHistoryRow => row !== null)
    .sort((a, b) => b.runDate.localeCompare(a.runDate) || a.transferNumber - b.transferNumber);

  return {
    rows,
    totalRuns: rows.length,
    finishedRuns: rows.filter(r => r.status === 'finished').length,
    activeRuns: rows.filter(r => r.status === 'active').length,
    morningRuns: rows.filter(r => r.direction === 'morning').length,
    eveningRuns: rows.filter(r => r.direction === 'evening').length,
  };
}
