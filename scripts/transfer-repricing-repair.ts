import { supabase } from '../src/services/supabase';
import { normalizeSchoolCode, normalizeVehicle, normalizeZone } from '../src/modules/families/constants';
import { buildTransferRepricingPlan, PricingManagedChargeSnapshot, TransferRepricingChildSnapshot } from '../src/services/transferRepricing';
import { SchoolCode, VehicleType, Zone } from '../src/types';

type RawChild = Record<string, any>;

async function fetchAll(select: string): Promise<RawChild[]> {
  const result: RawChild[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('v2_children')
      .select(select)
      .neq('status', 'rejected')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    result.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return result;
  }
}

async function loadRows(includeMigrationColumns: boolean): Promise<RawChild[]> {
  const common = `
    id, family_id, child_name, zone, vehicle_type, base_price, final_price,
    sibling_discount_percent, manual_discount_percent, manual_discount_amount, transfer_id,
    v2_families(parent_name, phone), v2_school_branches(code),
    v2_transfers(id, transfer_number, vehicle_type)
  `;
  if (!includeMigrationColumns) return fetchAll(common);
  return fetchAll(`${common}, requested_vehicle_type,
    v2_charges(id, charge_type, original_amount, amount, paid_amount, pricing_managed, status)`);
}

function relation(row: any): any {
  return Array.isArray(row) ? row[0] : row;
}

function snapshot(row: RawChild): TransferRepricingChildSnapshot {
  const branch = relation(row.v2_school_branches);
  return {
    id: String(row.id),
    familyId: String(row.family_id),
    childName: row.child_name ?? '',
    schoolCode: normalizeSchoolCode(branch?.code) as SchoolCode,
    zone: normalizeZone(row.zone, 'A') as Zone,
    requestedVehicleType: row.requested_vehicle_type
      ? normalizeVehicle(row.requested_vehicle_type) as VehicleType
      : normalizeVehicle(row.vehicle_type) as VehicleType,
    vehicleType: normalizeVehicle(row.vehicle_type) as VehicleType,
    basePrice: Number(row.base_price ?? 0),
    finalPrice: Number(row.final_price ?? 0),
    siblingDiscountPercent: Number(row.sibling_discount_percent ?? 0),
    manualDiscountPercent: Number(row.manual_discount_percent ?? 0),
    manualDiscountAmount: Number(row.manual_discount_amount ?? 0),
    transferId: row.transfer_id ? String(row.transfer_id) : null,
    charges: (row.v2_charges ?? []).map((charge: any): PricingManagedChargeSnapshot => ({
      id: String(charge.id),
      chargeType: charge.charge_type,
      originalAmount: Number(charge.original_amount ?? 0),
      amount: Number(charge.amount ?? 0),
      paidAmount: Number(charge.paid_amount ?? 0),
      pricingManaged: Boolean(charge.pricing_managed),
      status: charge.status,
    })),
  };
}

function operationId(): string {
  return crypto.randomUUID();
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const idArg = process.argv.find(arg => arg.startsWith('--child-ids='));
  const confirmArg = process.argv.find(arg => arg.startsWith('--confirm-count='));
  const allowedIds = new Set((idArg?.split('=')[1] ?? '').split(',').filter(Boolean));
  const confirmedCount = Number(confirmArg?.split('=')[1] ?? -1);
  if (apply && (!allowedIds.size || confirmedCount !== allowedIds.size)) {
    throw new Error('Apply requires an explicit --child-ids=id1,id2 allowlist and matching --confirm-count=N');
  }

  const rows = await loadRows(apply);
  const mismatches = rows.filter(row => {
    const transfer = relation(row.v2_transfers);
    return transfer?.vehicle_type && normalizeVehicle(row.vehicle_type) !== normalizeVehicle(transfer.vehicle_type);
  });
  const selected = apply ? mismatches.filter(row => allowedIds.has(String(row.id))) : mismatches;
  if (apply && selected.length !== allowedIds.size) {
    throw new Error(`Allowlist has ${allowedIds.size} IDs, but only ${selected.length} are still mismatched; aborting`);
  }

  const plans = new Map<string, NonNullable<ReturnType<typeof buildTransferRepricingPlan>>>();
  for (const row of selected) {
    const transfer = relation(row.v2_transfers);
    const child = snapshot(row);
    const plan = buildTransferRepricingPlan({
      operationId: operationId(),
      transferId: String(transfer.id),
      transferNumber: Number(transfer.transfer_number),
      previousTransferVehicleType: normalizeVehicle(transfer.vehicle_type) as VehicleType,
      newVehicleType: normalizeVehicle(transfer.vehicle_type) as VehicleType,
      source: 'logistics',
      children: [child],
      updateTransferType: false,
      force: true,
      actorName: 'CRM repair',
    });
    if (plan) plans.set(child.id, plan);
  }

  if (apply) {
    for (const plan of plans.values()) {
      const { error } = await supabase.rpc('v2_apply_transfer_repricing', { p_plan: plan });
      if (error) throw new Error(`Child ${plan.children[0]?.id}: ${error.message}`);
    }
    console.log(`Applied ${plans.size} explicitly confirmed repairs.`);
    return;
  }

  console.log(`# Dry-run рассинхронизации транспорта\n\nНайдено: ${plans.size}. Изменения не применялись.\n`);
  console.log('| № | Child ID | Семья | Телефон | Ребёнок | Школа | Трансфер | Тип old → new | Цена old → new |');
  console.log('|---:|---|---|---|---|---|---:|---|---:|');
  let index = 0;
  for (const row of selected) {
    const family = relation(row.v2_families);
    const branch = relation(row.v2_school_branches);
    const transfer = relation(row.v2_transfers);
    const planned = plans.get(String(row.id))?.children[0];
    if (!planned) continue;
    index += 1;
    console.log(`| ${index} | ${row.id} | ${family?.parent_name ?? ''} | ${family?.phone ?? ''} | ${row.child_name ?? ''} | ${branch?.code ?? ''} | ${transfer.transfer_number} | ${row.vehicle_type} → ${transfer.vehicle_type} | ${planned.oldFinalPrice} → ${planned.newFinalPrice} |`);
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
