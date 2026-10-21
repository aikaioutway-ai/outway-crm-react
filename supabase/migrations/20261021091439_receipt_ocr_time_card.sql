alter table public.v2_payments
  add column if not exists receipt_time text,
  add column if not exists receipt_card_last4 text,
  add column if not exists receipt_bank text;
