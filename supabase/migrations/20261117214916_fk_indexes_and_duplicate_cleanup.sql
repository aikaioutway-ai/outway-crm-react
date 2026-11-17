-- Индексы на внешние ключи, которые реально читаются, и удаление индексов-близнецов.
-- Таблицы маленькие (до ~7 тыс. строк), поэтому обычный CREATE INDEX занимает доли секунды.
-- Данные не меняются: только индексы.

-- 1. Недостающие индексы на внешние ключи.
-- Распределение оплат по начислениям: 11 тыс. полных сканирований, ни одного индексного.
create index if not exists idx_v2_charge_allocations_charge_id on public.v2_charge_allocations (charge_id);
create index if not exists idx_v2_charge_allocations_wallet_tx on public.v2_charge_allocations (wallet_transaction_id);
-- Результаты сверки выписок: поиск по строке выписки и по платежу.
create index if not exists idx_v2_reconciliation_results_entry_id on public.v2_reconciliation_results (entry_id);
create index if not exists idx_v2_reconciliation_results_payment_id on public.v2_reconciliation_results (payment_id);
-- Дети по школе и машины по водителю (нужны и для удаления школы/водителя без полного прохода).
create index if not exists idx_v2_children_school_id on public.v2_children (school_id);
create index if not exists idx_v2_vehicles_driver_id on public.v2_vehicles (driver_id);
-- Возвраты по расходу и по транзакции кошелька.
create index if not exists idx_v2_refunds_expense_id on public.v2_refunds (expense_id);
create index if not exists idx_v2_refunds_wallet_tx on public.v2_refunds (wallet_transaction_id);

-- 2. Индексы-близнецы: у каждого есть точная копия с тем же определением.
-- Удаляем ту копию, которой планировщик не пользуется (0 сканирований); оставшаяся покрывает те же запросы.
drop index if exists public.idx_v2_children_family;          -- копия idx_v2_children_family_id
drop index if exists public.idx_v2_children_branch;          -- копия idx_v2_children_branch_id
drop index if exists public.idx_v2_driver_advances_driver;   -- копия idx_v2_driver_advances_driver_id
drop index if exists public.idx_bank_statements_receipt_code; -- копия bank_statements_receipt_code_idx
drop index if exists public.bank_statements_match_status_idx; -- копия idx_bank_statements_match_status
-- Обычные индексы, полностью повторяющие уникальные (уникальный индекс обслуживает те же запросы).
drop index if exists public.idx_v2_families_summary_family_id;    -- = v2_families_summary_pkey
drop index if exists public.idx_v2_transfers_branch_number;       -- = v2_transfers_branch_id_transfer_number_key
drop index if exists public.idx_v2_transfer_runs_transfer_date;   -- = v2_transfer_runs_transfer_id_run_date_direction_key
drop index if exists public.idx_v2_transfer_run_stops_run;        -- = v2_transfer_run_stops_run_id_stop_order_key
