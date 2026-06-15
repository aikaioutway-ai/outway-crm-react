-- OutWay CRM: destructive reset of CRM data.
-- Run only after backup/export.
-- This keeps schema, functions, auth users, storage buckets.

truncate table
  public.payment_items,
  public.payments,
  public.charges,
  public.audit_log,
  public.children,
  public.families
restart identity cascade;
