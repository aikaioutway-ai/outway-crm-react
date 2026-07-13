-- OutWay CRM — фикс несовпадения check-ограничений с кодом приложения
-- Запустить в Supabase SQL Editor
--
-- Проблема 1: financeService.ts (cancelConfirmedPayment) пишет transaction_type
-- 'payment_reversed', SQL-функции отмены платежа пишут 'payment_cancelled' —
-- ни одного из двух значений не было в check-ограничении v2_wallet_transactions,
-- из-за чего отмена подтверждённого платежа падала с ошибкой базы данных.
--
-- Проблема 2: EmployeesPage.tsx предлагает роли 'gen_director' и 'senior_logist',
-- которых не было в check-ограничении v2_employees.role — сохранить сотрудника
-- с одной из этих ролей было невозможно.

alter table public.v2_wallet_transactions
  drop constraint if exists v2_wallet_transactions_transaction_type_check;

alter table public.v2_wallet_transactions
  add constraint v2_wallet_transactions_transaction_type_check
  check (
    transaction_type in (
      'payment_confirmed',
      'payment_reversed',
      'payment_cancelled',
      'charge_writeoff',
      'deposit_writeoff',
      'deposit_topup',
      'adjustment_refund',
      'manual_adjustment',
      'refund'
    )
  );

alter table public.v2_employees
  drop constraint if exists v2_employees_role_check;

alter table public.v2_employees
  add constraint v2_employees_role_check
  check (
    role in (
      'admin',
      'gen_director',
      'director',
      'manager',
      'senior_logist',
      'logist',
      'cashier',
      'driver'
    )
  );
