-- Комментарий кассира к решению по платежу (подтвердить / отклонить).
-- Отдельно от comment — это комментарий менеджера, который внёс платёж.
alter table public.v2_payments add column if not exists cashier_comment text;
