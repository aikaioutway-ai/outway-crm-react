-- Updates and deletes are routed through b2b-payout-api, which validates the
-- signed employee session and permits only admin/cashier roles.
revoke update, delete on public.v2_b2b_driver_payments from anon, authenticated;

-- Trigger functions are not public RPC endpoints.
revoke execute on function public.v2_b2b_expense_from_driver_payment() from public, anon, authenticated;
revoke execute on function public.v2_b2b_expense_delete_from_driver_payment() from public, anon, authenticated;
revoke execute on function public.v2_b2b_tax_expense_from_client_payment() from public, anon, authenticated;
revoke execute on function public.v2_b2b_tax_expense_delete_from_client_payment() from public, anon, authenticated;
