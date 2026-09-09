-- Выплата водителю никогда не облагается налогом — налог 4% относится только
-- к выручке (оплате клиента), эта логика уже верно реализована триггером
-- v2_b2b_tax_expense_from_client_payment (source = 'tax_4pct').
--
-- Раньше tax_amount/net_amount в v2_b2b_driver_payments и в авто-созданном
-- расходе v2_b2b_expenses (source = 'driver_payment') считали налог как 4%
-- от суммы самой выплаты водителю — это и есть баг, который правим здесь.
-- Старые вычисленные значения сохраняем в legacy-колонках для аудита.

alter table public.v2_b2b_driver_payments rename column tax_amount to legacy_tax_amount;
alter table public.v2_b2b_driver_payments rename column net_amount to legacy_net_amount;

alter table public.v2_b2b_driver_payments add column tax_amount numeric(14,2)
  generated always as (0) stored;

alter table public.v2_b2b_driver_payments add column net_amount numeric(14,2)
  generated always as (amount) stored;

alter table public.v2_b2b_expenses rename column tax_amount to legacy_tax_amount;
alter table public.v2_b2b_expenses rename column net_amount to legacy_net_amount;

alter table public.v2_b2b_expenses add column tax_amount numeric(14,2)
  generated always as (0) stored;

alter table public.v2_b2b_expenses add column net_amount numeric(14,2)
  generated always as (amount) stored;
