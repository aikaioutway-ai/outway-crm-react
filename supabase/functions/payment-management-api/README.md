# Payment deletion with history

Requires the `driver_advances_and_payment_deletion_history` migration.

Deployment is pending explicit user approval after automatic deployment review rejected a public Edge Function using `verify_jwt: false`. Do not deploy until that approval is given.

This application uses employee sessions, not Supabase Auth JWTs. The handler verifies the HMAC-signed `x-employee-session` and its expiration, then reads the employee's current active status and role. Only admin, gen_director and cashier can delete. The transactional SQL function is callable only by service_role. Standard Supabase JWT verification is disabled for this handler because the application's publishable key is not a JWT; employee-session verification remains mandatory.

Deletion archives the original payment and bank matches in `v2_audit_log`, under the family ID with `action = payment_delete`, reverses confirmed payments using the existing wallet cancellation function, resets bank reconciliation, and removes the live payment. The receipt file stays available through its archived URL. Any failure rolls back the entire operation.

`supabase/tests/payment_deletion_history.sql` runs transactional integration checks ending in ROLLBACK. Frontend tests cover driver selection, filtering, office advances, deletion session requirements, server denial, and archived receipt display.
